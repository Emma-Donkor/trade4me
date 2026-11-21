import { z } from 'zod';
import { percentageSchema, positiveMoneySchema, symbolSchema } from './common.schema';
import { riskRewardOf, stopAndTargetOnCorrectSide } from './paper.schema';

/** README §14.1 — hypothetical order sizing calculation. */
export const riskCalculateSchema = z
  .strictObject({
    symbol: symbolSchema,
    side: z.enum(['LONG', 'SHORT']).default('LONG'),
    balance: positiveMoneySchema,
    riskPerTradePct: percentageSchema,
    entry: positiveMoneySchema,
    stopLoss: positiveMoneySchema,
    takeProfit: positiveMoneySchema,
    volatility: z.number().finite().min(0).optional(),
  })
  .refine(stopAndTargetOnCorrectSide, {
    message: 'Stop loss and take profit must be on the correct side of entry',
    path: ['stopLoss'],
  })
  .refine((value) => riskRewardOf(value) > 0, {
    message: 'Risk/reward must be greater than 0',
    path: ['takeProfit'],
  });

export const riskRuleVerdictSchema = z.strictObject({
  rule: z.string().min(1),
  status: z.enum(['PASS', 'WARN', 'BLOCK']),
  reason: z.string().min(1).optional(),
});

/** README §14.4 — full order evaluation including profile overrides. */
export const riskEvaluateSchema = z.strictObject({
  order: z.strictObject({
    symbol: symbolSchema,
    side: z.enum(['LONG', 'SHORT']),
    entry: positiveMoneySchema,
    stopLoss: positiveMoneySchema,
    takeProfit: positiveMoneySchema,
    size: positiveMoneySchema,
  }),
  profile: z
    .strictObject({
      riskPerTradePct: percentageSchema,
      maxOpenPositions: z.number().int().min(1),
      maxDailyLossPct: percentageSchema,
      minRiskReward: z.number().finite().min(0),
      newsEventRestrictions: z.boolean().optional(),
    })
    .optional(),
});

export const riskProfileSchema = z.strictObject({
  name: z.enum(['Conservative', 'Moderate', 'Aggressive']),
  riskPerTradePct: percentageSchema,
  maxOpenPositions: z.number().int().min(1),
  maxDailyLossPct: percentageSchema,
  minRiskReward: z.number().finite().min(0),
  maxPortfolioExposurePct: percentageSchema.optional(),
  maxDrawdownPct: percentageSchema.optional(),
  maxVolatility: z.number().finite().min(0).optional(),
  newsEventRestrictions: z.boolean().optional(),
});

export type RiskCalculateInput = z.infer<typeof riskCalculateSchema>;
export type RiskEvaluateInput = z.infer<typeof riskEvaluateSchema>;
export type RiskProfileInput = z.infer<typeof riskProfileSchema>;
