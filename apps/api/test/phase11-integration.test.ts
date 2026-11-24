import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { disconnect } from '@ts/database';
import type { NewsImpact, Sentiment } from '@ts/types';
import { EconomicEventsService } from '../src/modules/news/economic-events.service';
import { decodeStoredText } from '../src/modules/news/analysis/sanitizer';
import { NewsIngestionService } from '../src/modules/news/news-ingestion.service';
import { NEWS_NOW } from '../src/modules/news/news.tokens';
import { EventsService } from '../src/modules/websocket/events.service';
import { accessTokenFor, createPhase7TestApp, type Phase7TestApp } from './helpers/test-app';

function bearer(token: string): string {
  return `Bearer ${token}`;
}

const NOW = new Date('2026-01-15T12:00:00.000Z');
const WEIGHT: Record<NewsImpact, number> = { LOW: 1, MEDIUM: 2, HIGH: 4, EXTREME: 8 };

describe('P11 news intelligence', () => {
  let harness: Phase7TestApp;
  let userToken: string;
  const notificationNew = jest.fn();
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://tradesense:tradesense@localhost:5433/tradesense_test';

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    await disconnect();
    harness = await createPhase7TestApp({
      configure: (builder) =>
        builder
          .overrideProvider(NEWS_NOW)
          .useValue(() => NOW)
          .overrideProvider(EventsService)
          .useValue({ notificationNew, emit: jest.fn() }),
    });
    userToken = await accessTokenFor(harness, 'USER');
    await harness.prisma.newsAnalysis.deleteMany();
    await harness.prisma.newsArticle.deleteMany();
    await harness.prisma.economicEvent.deleteMany();
    await harness.prisma.systemEvent.deleteMany();
    await harness.prisma.currencyPair.upsert({
      where: { symbol: 'EUR/USD' },
      create: {
        symbol: 'EUR/USD',
        baseCurrency: 'EUR',
        quoteCurrency: 'USD',
        pipSize: 0.0001,
        pointValue: 10,
        spreadPipsTypical: 1.2,
        providerSymbols: {},
      },
      update: { isActive: true },
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
    await disconnect();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }, 120_000);

  it('ingests mock news, dedupes by URL and content, classifies and hardens text', async () => {
    const ingestion = harness.moduleRef.get(NewsIngestionService);
    const result = await ingestion.run();

    expect(result.articlesFetched).toBe(10);
    expect(result.articlesInserted).toBe(8);
    expect(result.duplicates).toBe(2);
    expect(result.eventsInserted).toBe(5);
    expect(result.highImpact).toBeGreaterThanOrEqual(1);

    const articles = await harness.prisma.newsArticle.findMany({ include: { analysis: true } });
    expect(articles).toHaveLength(8);
    expect(articles.every((article) => article.analysis !== null)).toBe(true);
    expect(
      new Set(articles.map((article) => article.analysis?.eventType)).size,
    ).toBeGreaterThanOrEqual(6);

    const injection = articles.find((article) => article.source === 'untrusted-feed');
    expect(injection).toBeDefined();
    expect(injection?.rawText).not.toContain('<script');
    expect(injection?.rawText).not.toContain('Ignore previous instructions');
    const decoded = decodeStoredText(injection?.rawText);
    expect(decoded.safety.injectionAttempted).toBe(true);
    expect(decoded.safety.redactions).toBeGreaterThanOrEqual(3);

    const audit = await harness.prisma.systemEvent.findMany({
      where: { code: 'news_injection_scrubbed' },
    });
    expect(audit.length).toBe(1);

    expect(notificationNew).toHaveBeenCalledWith(
      expect.objectContaining({ notification: expect.objectContaining({ type: 'NEWS_ALERT' }) }),
    );
  }, 60_000);

  it('serves the real news routes with filters and article detail', async () => {
    const filtered = await request(harness.app.getHttpServer())
      .get('/api/v1/news?currency=EUR&sentiment=BULLISH&impact=HIGH')
      .set('Authorization', bearer(userToken))
      .expect(200);
    expect(filtered.body.data.items.length).toBeGreaterThanOrEqual(1);
    for (const article of filtered.body.data.items) {
      expect(article.currencies).toContain('EUR');
      expect(article.analysis).toMatchObject({ sentiment: 'BULLISH', impact: 'HIGH' });
    }

    const all = await request(harness.app.getHttpServer())
      .get('/api/v1/news?pageSize=3')
      .set('Authorization', bearer(userToken))
      .expect(200);
    expect(all.body.data.items).toHaveLength(3);
    expect(all.body.data.hasMore).toBe(true);
    expect(all.body.data.nextCursor).toBeTruthy();

    const first = all.body.data.items[0];
    const detail = await request(harness.app.getHttpServer())
      .get(`/api/v1/news/${first.id}`)
      .set('Authorization', bearer(userToken))
      .expect(200);
    expect(detail.body.data).toMatchObject({ id: first.id, title: first.title });
    expect(detail.body.data.analysis).toBeDefined();

    const missing = await request(harness.app.getHttpServer())
      .get('/api/v1/news/unknown-article')
      .set('Authorization', bearer(userToken))
      .expect(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('computes economic-event proximity and imminent risk', async () => {
    const calendar = harness.moduleRef.get(EconomicEventsService);
    const risks = await calendar.imminentRisks();
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({
      eventName: 'Fed Interest Rate Decision',
      currency: 'USD',
      eventClass: 'RATES',
      minutesUntil: 30,
      imminent: true,
    });

    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/news/events')
      .set('Authorization', bearer(userToken))
      .expect(200);
    expect(response.body.data.items).toHaveLength(5);
    const imminent = response.body.data.items.filter(
      (event: { imminent: boolean }) => event.imminent,
    );
    expect(imminent).toHaveLength(1);
  });

  it('aggregates impact × recency weighted pair sentiment matching a hand calculation', async () => {
    const rows = await harness.prisma.newsArticle.findMany({
      where: { analysis: { is: { affectedPairs: { has: 'EUR/USD' } } } },
      include: { analysis: true },
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Independent calculation from the stored rows: weight = impact × recency
    // where recency = 1 - ageHours/72 with a 5% floor; score = 50 + 50×(pos-neg)/total.
    let positive = 0;
    let negative = 0;
    let total = 0;
    for (const row of rows) {
      const ageHours = (NOW.getTime() - row.publishedAt.getTime()) / 3_600_000;
      const weight = WEIGHT[row.analysis!.impact] * Math.max(0.05, 1 - ageHours / 72);
      total += weight;
      if (row.analysis!.sentiment === 'BULLISH') positive += weight;
      if (row.analysis!.sentiment === 'BEARISH') negative += weight;
    }
    const expected = Math.round(50 + (50 * (positive - negative)) / total);

    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/news/sentiment/EUR%2FUSD')
      .set('Authorization', bearer(userToken))
      .expect(200);
    expect(response.body.data).toMatchObject({
      symbol: 'EUR/USD',
      score: expected,
      articleCount: rows.length,
      computedAt: NOW.toISOString(),
    });
    const label: Sentiment = expected >= 60 ? 'BULLISH' : expected <= 40 ? 'BEARISH' : 'NEUTRAL';
    expect(response.body.data.sentiment).toBe(label);

    // The 5-minute cache must serve the same result without a recompute.
    const cached = await request(harness.app.getHttpServer())
      .get('/api/v1/news/sentiment/EUR%2FUSD')
      .set('Authorization', bearer(userToken))
      .expect(200);
    expect(cached.body.data).toEqual(response.body.data);
  });

  it('returns INSUFFICIENT_DATA when no articles cover a symbol', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/news/sentiment/ABC%2FXYZ')
      .set('Authorization', bearer(userToken))
      .expect(422);
    expect(response.body.error.code).toBe('INSUFFICIENT_DATA');
  });
});
