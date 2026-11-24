import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NewsEventType, NewsImpact, Sentiment } from '@ts/types';
import { classifyText } from './classifier';
import { detectEventClass, eventProximity, EVENT_CLASSES } from './events';
import { extractCurrencies, pairsForCurrencies } from './extractor';
import { contentHash, decodeStoredText, encodeStoredText, sanitizeText } from './sanitizer';
import { sentimentLabel, weightedSentiment } from './weighting';

interface EventClassFixture {
  name: string;
  text: string;
}

interface SentimentFixture {
  name: string;
  text: string;
  sentiment: Sentiment;
  impact: NewsImpact;
}

interface InjectionFixture {
  name: string;
  title: string;
  body: string;
}

const articleFixtures = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/news/articles.json'), 'utf8'),
) as {
  eventClasses: EventClassFixture[];
  sentimentCases: SentimentFixture[];
  injection: InjectionFixture;
};

const eventFixtures = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/news/events.json'), 'utf8'),
) as {
  proximity: Array<{
    name: string;
    minutesAhead: number;
    minutesUntil: number;
    imminent: boolean;
  }>;
  calendar: Array<{
    eventName: string;
    currency: string;
    hoursAhead: number;
    impact: NewsImpact;
    eventClass: string;
  }>;
};

describe('P11 deterministic analysis pipeline', () => {
  describe('event taxonomy', () => {
    it.each(articleFixtures.eventClasses)('detects $name', (fixture) => {
      const result = classifyText(fixture.text);
      const expected: Record<string, NewsEventType> = {
        rates: 'INTEREST_RATES',
        inflation: 'INFLATION',
        gdp: 'GDP',
        employment: 'EMPLOYMENT',
        centralBank: 'CENTRAL_BANK',
        governmentPolicy: 'GOVERNMENT_POLICY',
        geopolitical: 'GEOPOLITICAL',
        economicRelease: 'ECONOMIC_RELEASE',
      };
      expect(result.eventType).toBe(expected[fixture.name]);
    });

    it('classifies every calendar fixture into a known event class', () => {
      for (const fixture of eventFixtures.calendar) {
        expect(EVENT_CLASSES).toContain(detectEventClass(fixture.eventName));
        expect(detectEventClass(fixture.eventName)).toBe(fixture.eventClass);
      }
    });
  });

  describe('sentiment and impact', () => {
    it.each(articleFixtures.sentimentCases)('labels $name as $sentiment / $impact', (fixture) => {
      const result = classifyText(fixture.text);
      expect(result.sentiment).toBe(fixture.sentiment);
      expect(result.impact).toBe(fixture.impact);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(0.99);
    });

    it('stays deterministic for identical text', () => {
      const text = articleFixtures.sentimentCases[3].text;
      expect(classifyText(text)).toEqual(classifyText(text));
    });
  });

  describe('entity extraction', () => {
    it('extracts currencies from codes, pairs and institutions', () => {
      expect(
        extractCurrencies('The ECB and the Federal Reserve discussed EUR/USD and JPY.'),
      ).toEqual(['EUR', 'JPY', 'USD']);
    });

    it('maps currencies onto known pairs deterministically', () => {
      expect(pairsForCurrencies(['EUR', 'USD', 'GBP'], ['GBP/USD', 'EUR/USD', 'USD/JPY'])).toEqual([
        'EUR/USD',
        'GBP/USD',
      ]);
    });
  });

  describe('dedupe and untrusted text hardening', () => {
    it('collapses identical content republished at another URL', () => {
      const first = contentHash(['Same headline', 'Same summary', 'Same body']);
      const syndicated = contentHash(['Same headline', 'Same summary', 'Same body']);
      const different = contentHash(['Same headline', 'Same summary', 'Different body']);
      expect(syndicated).toBe(first);
      expect(different).not.toBe(first);
    });

    it('scrubs markup and injection phrases and flags the attempt', () => {
      const fixture = articleFixtures.injection;
      const sanitized = sanitizeText(`${fixture.title}. ${fixture.body}`);
      expect(sanitized.text).not.toContain('<script');
      expect(sanitized.text).not.toContain('Ignore previous instructions');
      expect(sanitized.text).not.toContain('Disregard all prior');
      expect(sanitized.text).toContain('[redacted]');
      expect(sanitized.safety.injectionAttempted).toBe(true);
      expect(sanitized.safety.redactions).toBeGreaterThanOrEqual(3);
    });

    it('truncates oversized content and records the safety marker', () => {
      const sanitized = sanitizeText('word '.repeat(2000));
      expect(sanitized.safety.truncated).toBe(true);
      expect(sanitized.text.length).toBeLessThanOrEqual(4000);

      const encoded = encodeStoredText(sanitized);
      const decoded = decodeStoredText(encoded);
      expect(decoded.safety).toEqual(sanitized.safety);
      expect(decoded.text).toBe(sanitized.text);
    });

    it('treats stored text without a marker as clean plain text', () => {
      expect(decodeStoredText('plain headline')).toEqual({
        text: 'plain headline',
        safety: { injectionAttempted: false, redactions: 0, truncated: false },
      });
    });
  });

  describe('economic-event proximity', () => {
    const now = new Date('2026-01-15T12:00:00.000Z');
    it.each(eventFixtures.proximity)('computes $name proximity', (fixture) => {
      const scheduledAt = new Date(now.getTime() + fixture.minutesAhead * 60_000);
      expect(eventProximity(scheduledAt, now)).toEqual({
        minutesUntil: fixture.minutesUntil,
        imminent: fixture.imminent,
      });
    });
  });

  describe('pair sentiment weighting', () => {
    it('matches a hand-computed impact × recency score', () => {
      const now = new Date('2026-01-15T12:00:00.000Z');
      // HIGH×1 = 4; MEDIUM×(1-24/72)=4/3; LOW×(1-48/72)=1/3.
      const score = weightedSentiment(
        [
          { sentiment: 'BULLISH', impact: 'HIGH', publishedAt: now },
          {
            sentiment: 'BEARISH',
            impact: 'MEDIUM',
            publishedAt: new Date(now.getTime() - 24 * 3_600_000),
          },
          {
            sentiment: 'NEUTRAL',
            impact: 'LOW',
            publishedAt: new Date(now.getTime() - 48 * 3_600_000),
          },
        ],
        now,
      );
      // 50 + 50×(4 - 4/3)/(4 + 4/3 + 1/3) = 73.53 → 74.
      expect(score).toEqual({ score: 74, articleCount: 3 });
      expect(sentimentLabel(score.score)).toBe('BULLISH');
    });

    it('returns a neutral score when there are no articles', () => {
      expect(weightedSentiment([], new Date())).toEqual({ score: 50, articleCount: 0 });
      expect(sentimentLabel(50)).toBe('NEUTRAL');
    });
  });
});
