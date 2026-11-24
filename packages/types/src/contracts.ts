/**
 * Boundary contracts shared by the API, web app and AI service.
 *
 * The eight AI DTO interfaces below keep their original declarations so the
 * P03 TypeScript↔Python parity guard keeps reading one authoritative file.
 * Domain types introduced by P05 live in their own modules and are re-exported
 * from `index.ts`; this file remains the canonical home for AI route payloads.
 */

export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1' | 'MN1';
export type Direction = 'LONG' | 'SHORT' | 'NEUTRAL';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

/** README §8.4 plus the generic HTTP codes emitted by the API error filter. */
export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'MARKET_DATA_STALE'
  | 'MARKET_DATA_UNAVAILABLE'
  | 'NO_TRADE_RULE_VIOLATION'
  | 'RATE_LIMITED'
  | 'AI_SERVICE_UNAVAILABLE'
  | 'INSUFFICIENT_DATA'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'BAD_GATEWAY'
  | 'SERVICE_UNAVAILABLE'
  | 'NOT_IMPLEMENTED'
  | 'HTTP_ERROR';

export interface IndicatorCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface IndicatorsRequest {
  symbol: string;
  timeframe: Timeframe;
  indicators?: string[];
  /** Bounded OHLC window; the AI engine is the single math authority. */
  candles?: IndicatorCandle[];
}

export interface IndicatorsResponse {
  symbol: string;
  timeframe: Timeframe;
  indicators: Record<string, unknown>;
  computedAt: string;
}

/** P12 — bounded inputs sent to the Python feature authority. */
export interface FeatureInputCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface FeatureNewsInput {
  publishedAt: string;
  currencies?: string[];
  affectedPairs?: string[];
  sentiment: string;
  impact: string;
  confidence?: number;
}

export interface FeatureEventInput {
  scheduledAt: string;
  currency: string;
  impact: string;
}

export interface FeatureRegimeInput {
  regime: string;
  confidence: number;
  evidence?: Record<string, unknown>;
}

export interface FeatureVectorItem {
  timestamp: string;
  features: Record<string, number>;
}

export interface FeaturesRequest {
  symbol: string;
  timeframe: Timeframe;
  featureVersion?: string;
  asOf: string;
  candles: FeatureInputCandle[];
  peerCandles?: Record<string, FeatureInputCandle[]>;
  news?: FeatureNewsInput[];
  events?: FeatureEventInput[];
  regime?: FeatureRegimeInput | null;
  timestamps?: string[];
}

export interface FeaturesResponse {
  symbol: string;
  timeframe: Timeframe;
  featureVersion: string;
  features: Record<string, number>;
  timestamp: string;
  vectors: FeatureVectorItem[];
}

export interface PredictRequest {
  symbol: string;
  timeframe: Timeframe;
  horizon: number;
}

export interface PredictResponse {
  symbol: string;
  timeframe: Timeframe;
  direction: Direction;
  probability: number;
  confidence: number;
  riskLevel: RiskLevel;
  modelVersion: string;
}

export interface ExplainRequest {
  predictionId: string;
}

export interface ExplainFactor {
  name: string;
  impact: number;
}

export interface ExplainResponse {
  predictionId: string;
  summary: string;
  factors: ExplainFactor[];
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  requestId: string;
}

export interface ApiError {
  success: false;
  error: { code: ErrorCode; message: string; details?: unknown; requestId: string };
}

export type WebSocketEventName =
  | 'quote:update'
  | 'signal:new'
  | 'signal:changed'
  | 'analysis:updated'
  | 'notification:new'
  | 'position:update'
  | 'regime:changed';

export interface WebSocketEvent<T = unknown> {
  event: WebSocketEventName;
  data: T;
  timestamp: string;
  requestId?: string;
}
