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
export const PredictRequestSchema = predictRequestSchema;
export const PredictResponseSchema = predictResponseSchema;
export const ExplainRequestSchema = explainRequestSchema;
export const ExplainFactorSchema = explainFactorSchema;
export const ExplainResponseSchema = explainResponseSchema;
export const AssistantMessageSchema = assistantMessageSchema;
export const AssistantRequestSchema = assistantRequestSchema;

export type IndicatorsRequest = z.infer<typeof indicatorsRequestSchema>;
export type IndicatorsResponse = z.infer<typeof indicatorsResponseSchema>;
export type FeaturesRequest = z.infer<typeof featuresRequestSchema>;
export type FeaturesResponse = z.infer<typeof featuresResponseSchema>;
export type PredictRequest = z.infer<typeof predictRequestSchema>;
export type PredictResponse = z.infer<typeof predictResponseSchema>;
export type ExplainRequest = z.infer<typeof explainRequestSchema>;
export type ExplainResponse = z.infer<typeof explainResponseSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
