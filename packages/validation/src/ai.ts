import { z } from 'zod';

export const timeframeSchema = z.enum(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN1']);

export const directionSchema = z.enum(['LONG', 'SHORT', 'NEUTRAL']);

export const riskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'EXTREME']);

export const indicatorsRequestSchema = z.object({
  symbol: z.string().min(1),
  timeframe: timeframeSchema,
  indicators: z.array(z.string().min(1)).optional(),
});

export const indicatorsResponseSchema = z.object({
  symbol: z.string().min(1),
  timeframe: timeframeSchema,
  indicators: z.record(z.string(), z.unknown()),
  computedAt: z.string().min(1),
});

export const featuresRequestSchema = z.object({
  symbol: z.string().min(1),
  timeframe: timeframeSchema,
  featureVersion: z.string().min(1).optional(),
});

export const featuresResponseSchema = z.object({
  symbol: z.string().min(1),
  timeframe: timeframeSchema,
  featureVersion: z.string().min(1),
  features: z.record(z.string(), z.number()),
  timestamp: z.string().min(1),
});

export const predictRequestSchema = z.object({
  symbol: z.string().min(1),
  timeframe: timeframeSchema,
  horizon: z.number().int().positive(),
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

export const explainRequestSchema = z.object({
  predictionId: z.string().min(1),
});

export const explainResponseSchema = z.object({
  predictionId: z.string().min(1),
  summary: z.string(),
  factors: z.array(z.object({ name: z.string().min(1), impact: z.number() })),
});

/** PascalCase aliases for consumers that prefer class-style schema names. */
export const IndicatorsRequestSchema = indicatorsRequestSchema;
export const IndicatorsResponseSchema = indicatorsResponseSchema;
export const FeaturesRequestSchema = featuresRequestSchema;
export const FeaturesResponseSchema = featuresResponseSchema;
export const PredictRequestSchema = predictRequestSchema;
export const PredictResponseSchema = predictResponseSchema;
export const ExplainRequestSchema = explainRequestSchema;
export const ExplainResponseSchema = explainResponseSchema;

export type IndicatorsRequest = z.infer<typeof indicatorsRequestSchema>;
export type IndicatorsResponse = z.infer<typeof indicatorsResponseSchema>;
export type FeaturesRequest = z.infer<typeof featuresRequestSchema>;
export type FeaturesResponse = z.infer<typeof featuresResponseSchema>;
export type PredictRequest = z.infer<typeof predictRequestSchema>;
export type PredictResponse = z.infer<typeof predictResponseSchema>;
export type ExplainRequest = z.infer<typeof explainRequestSchema>;
export type ExplainResponse = z.infer<typeof explainResponseSchema>;
