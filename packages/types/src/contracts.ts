export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1' | 'MN1';

export interface IndicatorsRequest {
  symbol: string;
  timeframe: Timeframe;
  indicators?: string[];
}

export interface IndicatorsResponse {
  symbol: string;
  timeframe: Timeframe;
  indicators: Record<string, unknown>;
  computedAt: string;
}

export interface FeaturesRequest {
  symbol: string;
  timeframe: Timeframe;
  featureVersion?: string;
}

export interface FeaturesResponse {
  symbol: string;
  timeframe: Timeframe;
  featureVersion: string;
  features: Record<string, number>;
  timestamp: string;
}

export interface PredictRequest {
  symbol: string;
  timeframe: Timeframe;
  horizon: number;
}

export interface PredictResponse {
  symbol: string;
  timeframe: Timeframe;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  probability: number;
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  modelVersion: string;
}

export interface ExplainRequest {
  predictionId: string;
}

export interface ExplainResponse {
  predictionId: string;
  summary: string;
  factors: Array<{ name: string; impact: number }>;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  requestId: string;
}

export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: unknown; requestId: string };
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
