import type { NewsImpact, Sentiment } from '@ts/types';
import { IMPACT_WEIGHT } from './lexicon';

const RECENCY_HALF_LIFE_HOURS = 72;
const MIN_RECENCY_WEIGHT = 0.05;
export const NEUTRAL_SCORE = 50;

export interface WeightedArticle {
  sentiment: Sentiment;
  impact: NewsImpact;
  publishedAt: Date | string;
}

/** Older articles decay linearly to a 5% floor over three days. */
export function recencyWeight(publishedAt: Date | string, now: Date | string): number {
  const hours = (new Date(now).getTime() - new Date(publishedAt).getTime()) / 3_600_000;
  if (hours <= 0) return 1;
  return Math.max(MIN_RECENCY_WEIGHT, 1 - hours / RECENCY_HALF_LIFE_HOURS);
}

/** Hand-computable impact × recency weighting; neutral items pull toward 50. */
export function weightedSentiment(
  articles: readonly WeightedArticle[],
  now: Date | string,
): { score: number; articleCount: number } {
  if (articles.length === 0) return { score: NEUTRAL_SCORE, articleCount: 0 };
  let positive = 0;
  let negative = 0;
  let total = 0;
  for (const article of articles) {
    const weight = IMPACT_WEIGHT[article.impact] * recencyWeight(article.publishedAt, now);
    total += weight;
    if (article.sentiment === 'BULLISH') positive += weight;
    else if (article.sentiment === 'BEARISH') negative += weight;
  }
  if (total === 0) return { score: NEUTRAL_SCORE, articleCount: articles.length };
  const score = Math.min(
    100,
    Math.max(0, Math.round(NEUTRAL_SCORE + (50 * (positive - negative)) / total)),
  );
  return { score, articleCount: articles.length };
}

export function sentimentLabel(score: number): Sentiment {
  if (score >= 60) return 'BULLISH';
  if (score <= 40) return 'BEARISH';
  return 'NEUTRAL';
}
