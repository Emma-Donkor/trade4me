import type { Timeframe } from './contracts';

/** README §10.2 — detections are context scores, never predictions. */
export type CandlePattern =
  | 'DOJI'
  | 'HAMMER'
  | 'INVERTED_HAMMER'
  | 'SHOOTING_STAR'
  | 'BULLISH_ENGULFING'
  | 'BEARISH_ENGULFING'
  | 'MORNING_STAR'
  | 'EVENING_STAR'
  | 'HARAMI';

/** README §10.3 — UNCERTAIN is a first-class classification. */
export type MarketRegime =
  | 'STRONG_UPTREND'
  | 'WEAK_UPTREND'
  | 'RANGE'
  | 'WEAK_DOWNTREND'
  | 'STRONG_DOWNTREND'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'UNCERTAIN';

export type ProviderStatus = 'HEALTHY' | 'DEGRADED' | 'DISABLED';

export interface CurrencyPair {
  id: string;
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  name?: string;
  active: boolean;
  pipSize?: number;
}

export interface MarketQuote {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  timestamp: string;
  provider: string;
}

export interface Candle {
  symbol: string;
  timeframe: Timeframe;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  provider: string;
}

export interface TechnicalIndicatorSnapshot {
  symbol: string;
  timeframe: Timeframe;
  name: string;
  value: number | Record<string, number>;
  version: string;
  computedAt: string;
  /** OBV/VWAP are indicative only because spot forex has no central volume. */
  indicative?: boolean;
}

export interface PatternDetection {
  pattern: CandlePattern;
  score: number;
  detectedAt: string;
}

export interface ProviderHealth {
  name: string;
  status: ProviderStatus;
  latencyMs?: number;
  lastCheckedAt: string;
}
