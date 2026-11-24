import type { NewsEventType, NewsImpact, Sentiment } from '@ts/types';
import {
  BEARISH_TERMS,
  BULLISH_TERMS,
  EVENT_RULES,
  HIGH_IMPACT_EVENT_TYPES,
  URGENT_PATTERNS,
} from './lexicon';

export interface Classification {
  eventType: NewsEventType;
  sentiment: Sentiment;
  impact: NewsImpact;
  confidence: number;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Deterministic, key-free classifier (README §11.1). It never predicts prices:
 * it labels the event, a bounded sentiment/impact and the confidence in that
 * labelling. P17 may layer an LLM enhancer over the same structured output.
 */
export function classifyText(text: string): Classification {
  const lower = String(text ?? '').toLowerCase();

  let bestType: NewsEventType = 'ECONOMIC_RELEASE';
  let bestScore = 0;
  for (const rule of EVENT_RULES) {
    const score = rule.patterns.reduce(
      (total, pattern) => total + (pattern.test(lower) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestType = rule.type;
    }
  }

  let bullish = 0;
  let bearish = 0;
  for (const term of BULLISH_TERMS) if (term.pattern.test(lower)) bullish += term.weight;
  for (const term of BEARISH_TERMS) if (term.pattern.test(lower)) bearish += term.weight;

  const signal = bullish + bearish;
  const sentiment: Sentiment =
    bullish === bearish ? 'NEUTRAL' : bullish > bearish ? 'BULLISH' : 'BEARISH';
  const urgency = URGENT_PATTERNS.reduce(
    (total, pattern) => total + (pattern.test(lower) ? 1 : 0),
    0,
  );

  const highImpactType = HIGH_IMPACT_EVENT_TYPES.includes(bestType);
  let impact: NewsImpact = 'LOW';
  if (urgency >= 2 && signal >= 2 && highImpactType) {
    impact = 'EXTREME';
  } else if (urgency >= 2 || (urgency >= 1 && signal >= 1) || (highImpactType && signal >= 2)) {
    // Urgency language alone (breaking/emergency/shock) is material even when
    // the text has no directional lexicon terms — it still drives the risk rule.
    impact = 'HIGH';
  } else if (signal >= 1 || bestScore > 0) {
    impact = 'MEDIUM';
  }

  const confidence = round(
    clamp(
      0.5 +
        Math.min(signal, 8) * 0.04 +
        Math.min(bestScore, 3) * 0.03 -
        (sentiment === 'NEUTRAL' ? 0.1 : 0),
      0.3,
      0.99,
    ),
  );

  return { eventType: bestType, sentiment, impact, confidence };
}
