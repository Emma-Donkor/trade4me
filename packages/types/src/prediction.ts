import type { PredictResponse, Timeframe } from './contracts';

/** The structured model output is the existing PredictResponse contract. */
export type StructuredModelOutput = PredictResponse;

/** README §13.2 — features are meaningless without the version that produced them. */
export interface FeatureVector {
  symbol: string;
  timeframe: Timeframe;
  timestamp: string;
  featureVersion: string;
  features: Record<string, number>;
}

export interface PredictionOutcome {
  predictionId: string;
  resolvedAt: string;
  actualMovePct: number;
  label: 0 | 1;
  correct: boolean;
}

export interface Prediction extends StructuredModelOutput {
  id: string;
  horizon: number;
  createdAt: string;
  featureVersion: string;
  outcome?: PredictionOutcome;
}

/** README §8.2 / P28 — the prepared admin performance surface. */
export interface ModelPerformanceView {
  modelVersion: string;
  status: 'TRAINING' | 'ACTIVE' | 'ARCHIVED' | 'DRIFT_WARNING';
  predictions: number;
  resolved: number;
  accuracy: number;
  brierScore: number;
}

/** README §13.9 — a drifting model is never silently treated as reliable. */
export interface ModelSignalPolicy {
  weight: number;
  block: boolean;
  reason: string | null;
}

export interface ModelMetrics {
  accuracy: number;
  precision?: number;
  recall?: number;
  f1?: number;
  rocAuc?: number;
  brierScore?: number;
}
