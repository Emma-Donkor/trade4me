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
}

export interface EconomicEvent {
  id: string;
  eventName: string;
  currency: string;
  scheduledAt: string;
  impact: NewsImpact;
  previous?: number | null;
  forecast?: number | null;
  actual?: number | null;
}

export interface PairSentiment {
  symbol: string;
  score: number;
  sentiment: Sentiment;
  articleCount: number;
  computedAt: string;
}
