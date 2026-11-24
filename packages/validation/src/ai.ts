import { z } from 'zod';

export const timeframeSchema = z.enum(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN1']);

export const directionSchema = z.enum(['LONG', 'SHORT', 'NEUTRAL']);

export const riskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'EXTREME']);

export const indicatorCandleSchema = z.object({
  timestamp: z.string().min(1),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().finite().optional(),
});

export const indicatorsRequestSchema = z.object({
  symbol: z.string().min(1),
  timeframe: timeframeSchema,
  indicators: z.array(z.string().min(1)).optional(),
  candles: z.array(indicatorCandleSchema).optional(),
});

export const indicatorsResponseSchema = z.object({
  symbol: z.string().min(1),
  timeframe: timeframeSchema,
  indicators: z.record(z.string(), z.unknown()),
  computedAt: z.string().min(1),
});

export const featureInputCandleSchema = z.object({
  timestamp: z.string().min(1),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().finite().optional(),
});

export const featureNewsInputSchema = z.object({
  publishedAt: z.string().min(1),
  currencies: z.array(z.string()).optional(),
  affectedPairs: z.array(z.string()).optional(),
  sentiment: z.string().min(1),
  impact: z.string().min(1),
  confidence: z.number().finite().optional(),
});

export const featureEventInputSchema = z.object({
  scheduledAt: z.string().min(1),
  currency: z.string(),
  impact: z.string().min(1),
});

export const featureRegimeInputSchema = z.object({
  regime: z.string().min(1),
  confidence: z.number(),
  evidence: z.record(z.string(), z.unknown()).optional(),
});

export const featureVectorItemSchema = z.object({
  timestamp: z.string().min(1),
  features: z.record(z.string(), z.number()),
});

export const featuresRequestSchema = z.object({
  symbol: z.string().min(1),
  timeframe: timeframeSchema,
  featureVersion: z.string().min(1).optional(),
  asOf: z.string().min(1),
  candles: z.array(featureInputCandleSchema),
  peerCandles: z.record(z.string(), z.array(featureInputCandleSchema)).optional(),
  news: z.array(featureNewsInputSchema).optional(),
  events: z.array(featureEventInputSchema).optional(),
  regime: featureRegimeInputSchema.nullable().optional(),
  timestamps: z.array(z.string().min(1)).optional(),
});

export const featuresResponseSchema = z.object({
  symbol: z.string().min(1),
  timeframe: timeframeSchema,
  featureVersion: z.string().min(1),
  features: z.record(z.string(), z.number()),
  timestamp: z.string().min(1),
  vectors: z.array(featureVectorItemSchema),
});

export const trainRequestSchema = z.strictObject({
  horizon: z.string().min(1),
  threshold: z.number().gt(0).lt(1),
  seed: z.number().int(),
  featureVersion: z.string().min(1).optional(),
  symbols: z.array(z.string().min(1)).optional(),
  timeframes: z.array(z.string().min(1)).optional(),
  trainStart: z.string().min(1).optional(),
  validationStart: z.string().min(1).optional(),
  testStart: z.string().min(1).optional(),
  end: z.string().min(1).optional(),
  calibrationMethod: z.enum(['platt', 'isotonic']),
  walkForward: z.boolean(),
  registryPath: z.string().min(1).optional(),
  reportPath: z.string().min(1).optional(),
  writeReport: z.boolean(),
});

export const trainResponseSchema = z.strictObject({
  datasetVersion: z.string().min(1),
  datasetChecksum: z.string().min(1),
  datasetRows: z.number().int().nonnegative(),
  featureVersion: z.string().min(1),
  selectedModel: z.string().min(1),
  selectedVersion: z.string().min(1),
  selectionReason: z.string(),
  xgboostGatePassed: z.boolean(),
  calibrationMethod: z.string().min(1),
  modelRuns: z.number().int().nonnegative(),
  models: z.record(z.string(), z.record(z.string(), z.unknown())),
  comparison: z.array(z.record(z.string(), z.unknown())),
  walkForward: z.record(z.string(), z.record(z.string(), z.unknown())),
});

export const predictRequestSchema = z.object({
  symbol: z.string().min(1),
  timeframe: timeframeSchema,
  horizon: z.number().int().positive(),
  featureVersion: z.string().min(1),
  asOf: z.string().min(1),
  features: z.record(z.string(), z.number()),
});

export const predictResponseSchema = z.object({
  symbol: z.string().min(1),
  timeframe: timeframeSchema,
  direction: directionSchema,
  probability: z.number().min(0).max(1),
  confidence: z.number().min(0),
  riskLevel: riskLevelSchema,
  modelVersion: z.string().min(1),
});

export const driftRequestSchema = z.strictObject({
  minSamples: z.number().int().gt(3),
  recentWindow: z.number().int().gt(3),
  accuracyDrop: z.number().gt(0),
  brierIncrease: z.number().gt(0),
});

export const driftResponseSchema = z.strictObject({
  modelVersion: z.string(),
  status: z.enum(['HEALTHY', 'DRIFT_WARNING']),
  historicalAccuracy: z.number().min(0).max(1),
  recentAccuracy: z.number().min(0).max(1),
  historicalBrier: z.number().min(0),
  recentBrier: z.number().min(0),
  samples: z.number().int().nonnegative(),
  reason: z.string().nullable(),
});

export const explainRequestSchema = z.strictObject({
  predictionId: z.string().min(1),
});

export const explainFactorSchema = z.strictObject({
  name: z.string().min(1),
  impact: z.number(),
});

export const explainResponseSchema = z.strictObject({
  predictionId: z.string().min(1),
  summary: z.string(),
  factors: z.array(explainFactorSchema),
});

/** README §12.5 — grounded assistant input; history is bounded. */
export const assistantMessageSchema = z.strictObject({
  role: z.enum(['USER', 'ASSISTANT']),
  content: z.string().min(1).max(4000),
  at: z.string().min(1).optional(),
});

export const assistantRequestSchema = z.strictObject({
  message: z.string().min(1).max(4000),
  history: z.array(assistantMessageSchema).max(50).optional(),
});

/** PascalCase aliases for consumers that prefer class-style schema names. */
export const IndicatorsRequestSchema = indicatorsRequestSchema;
export const IndicatorsResponseSchema = indicatorsResponseSchema;
export const FeaturesRequestSchema = featuresRequestSchema;
export const FeaturesResponseSchema = featuresResponseSchema;
export const TrainRequestSchema = trainRequestSchema;
export const TrainResponseSchema = trainResponseSchema;
export const PredictRequestSchema = predictRequestSchema;
export const PredictResponseSchema = predictResponseSchema;
export const DriftRequestSchema = driftRequestSchema;
export const DriftResponseSchema = driftResponseSchema;
export const ExplainRequestSchema = explainRequestSchema;
export const ExplainFactorSchema = explainFactorSchema;
export const ExplainResponseSchema = explainResponseSchema;
export const AssistantMessageSchema = assistantMessageSchema;
export const AssistantRequestSchema = assistantRequestSchema;

export type IndicatorsRequest = z.infer<typeof indicatorsRequestSchema>;
export type IndicatorsResponse = z.infer<typeof indicatorsResponseSchema>;
export type FeaturesRequest = z.infer<typeof featuresRequestSchema>;
export type FeaturesResponse = z.infer<typeof featuresResponseSchema>;
export type TrainRequest = z.infer<typeof trainRequestSchema>;
export type TrainResponse = z.infer<typeof trainResponseSchema>;
export type PredictRequest = z.infer<typeof predictRequestSchema>;
export type PredictResponse = z.infer<typeof predictResponseSchema>;
export type DriftRequest = z.infer<typeof driftRequestSchema>;
export type DriftResponse = z.infer<typeof driftResponseSchema>;
export type ExplainRequest = z.infer<typeof explainRequestSchema>;
export type ExplainResponse = z.infer<typeof explainResponseSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
