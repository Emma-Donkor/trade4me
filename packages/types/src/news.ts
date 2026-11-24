export type Sentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type NewsImpact = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export type NewsEventType =
  | 'INTEREST_RATES'
  | 'INFLATION'
  | 'GDP'
  | 'EMPLOYMENT'
  | 'CENTRAL_BANK'
  | 'GOVERNMENT_POLICY'
  | 'GEOPOLITICAL'
  | 'ECONOMIC_RELEASE';

/** P11 — safety metadata derived from the scrubbed, stored article text. */
export interface NewsSafety {
  injectionAttempted: boolean;
  redactions: number;
  truncated: boolean;
}

export interface NewsAnalysis {
  articleId: string;
  eventType: NewsEventType;
  sentiment: Sentiment;
  impact: NewsImpact;
  confidence: number;
  affectedPairs: string[];
  analyzedBy: string;
  analyzedAt: string;
}

export interface NewsArticle {
  id: string;
  source: string;
  sourceUrl?: string;
  title: string;
  description?: string;
  publishedAt: string;
  currencies: string[];
  analysis?: NewsAnalysis;
  /** Never contains executable markup; injection attempts are redacted. */
  safety?: NewsSafety;
}

export interface EconomicEvent {
  id: string;
  eventName: string;
  currency: string;
  eventClass: string;
  scheduledAt: string;
  impact: NewsImpact;
  previous?: number | null;
  forecast?: number | null;
  actual?: number | null;
  /** P11 — computed proximity for the risk rule, not a stored column. */
  minutesUntil?: number;
  imminent?: boolean;
}

export interface PairSentiment {
  symbol: string;
  score: number;
  sentiment: Sentiment;
  articleCount: number;
  computedAt: string;
}
