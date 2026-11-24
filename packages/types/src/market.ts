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
  /** README §9.1 — canonical symbol → provider-specific ticker map. */
  providerSymbols?: Record<string, unknown>;
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

/** README §8.2 — the projected candle payload served by `/market/candles`. */
export interface CandleView {
  symbol: string;
  timeframe: Timeframe;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  provider: string;
}

export interface CandleHistoryPage {
  items: CandleView[];
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
  asOf: string;
  source: 'db' | 'cache';
}

/** README §9.3 — real aggregations over stored candles, never fabricated. */
export interface HistoricalPeriodChange {
  period: 'previous_day' | 'previous_week' | 'previous_month' | 'previous_year';
  from: string;
  to: string;
  open: number;
  close: number;
  changePct: number;
  high: number;
  low: number;
  candles: number;
}

export interface HistoricalVolatilityStats {
  timeframe: Timeframe;
  annualizedPct: number;
  periodPct: number;
  sampleSize: number;
  asOf: string;
}

export interface SimilarHistoricalWindow {
  timestamp: string;
  distance: number;
  close: number;
  changePct: number;
}

export interface HistoricalAnalysisView {
  symbol: string;
  timeframe: Timeframe;
  asOf: string;
  periods: HistoricalPeriodChange[];
  volatility: HistoricalVolatilityStats;
  /** P12 replaces this deterministic shape scan with feature-space NN. */
  similarConditions: SimilarHistoricalWindow[];
  similarityMethod: 'deterministic-euclidean';
  dataPoints: number;
}

/** P09 last-sync view consumed by assessments and `/admin/health` (P33). */
export interface HistoryFreshnessView {
  tracked: number;
  freshCount: number;
  staleCount: number;
  oldestSyncAt: string | null;
  byTimeframe: Record<
    string,
    { lastSyncAt: string | null; dataFreshnessSeconds: number | null; isStale: boolean }
  >;
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

/** README §7.5/§9.2 — a quote is always accompanied by its freshness. */
export interface MarketQuoteView extends MarketQuote {
  dataFreshnessSeconds: number;
  isStale: boolean;
  source: 'live' | 'cache';
}

export interface QuoteResponse {
  items: MarketQuoteView[];
  asOf: string;
  unavailableSymbols?: string[];
}

export interface MarketOverview {
  asOf: string;
  totalPairs: number;
  quotes: MarketQuoteView[];
  freshCount: number;
  staleCount: number;
  unavailableCount: number;
  byProvider: Record<string, number>;
}

/** P28 will write these flags; P08 exposes read-only health for admins. */
export interface AdminProviderView {
  name: string;
  role: 'primary' | 'backup' | 'none';
  status: ProviderStatus;
  enabled: boolean;
  latencyMs: number | null;
  lastCheckedAt: string | null;
  requestsPerMinute: number;
}
