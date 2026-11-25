import { z } from 'zod';
import {
  dateTimeSchema,
  percentageSchema,
  positiveMoneySchema,
  symbolSchema,
} from './common.schema';
import { riskRewardOf, stopAndTargetOnCorrectSide } from './paper.schema';

/**
 * P15 hard ceilings. Kept as literals because @ts/validation intentionally has
 * no dependency on @ts/config; `packages/config/src/constants.ts` mirrors them
 * and a contract test asserts parity.
 */
export const RISK_HARD_CAPS = {
  riskPerTradePct: 2,
  maxOpenPositions: 8,
  maxDailyLossPct: 5,
  minRiskReward: 10,
  maxPortfolioExposurePct: 50,
  maxDrawdownPct: 20,
  maxVolatilityPct: 40,
} as const;

export const riskRuleCodeSchema = z.enum([
  'MAX_RISK_PER_TRADE',
  'MAX_DAILY_LOSS',
  'MAX_OPEN_POSITIONS',
  'MAX_PORTFOLIO_EXPOSURE',
  'MAX_CORRELATED_EXPOSURE',
  'MAX_DRAWDOWN',
  'MIN_RISK_REWARD',
  'MAX_VOLATILITY',
  'NEWS_EVENT_RESTRICTION',
  'MIN_CONFIDENCE',
  'DATA_STALENESS',
  'MISSING_FEATURES',
]);

/** README §14.1 — hypothetical order sizing calculation. */
export const riskCalculateSchema = z
  .strictObject({
    symbol: symbolSchema,
    side: z.enum(['LONG', 'SHORT']).default('LONG'),
    balance: positiveMoneySchema,
    riskPerTradePct: percentageSchema.max(RISK_HARD_CAPS.riskPerTradePct),
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
  severity: z.enum(['PASS', 'WARN', 'BLOCK']).optional(),
  code: riskRuleCodeSchema.optional(),
  message: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
});

const cappedProfileFields = {
  riskPerTradePct: percentageSchema.max(RISK_HARD_CAPS.riskPerTradePct),
  maxOpenPositions: z.number().int().min(1).max(RISK_HARD_CAPS.maxOpenPositions),
  maxDailyLossPct: percentageSchema.max(RISK_HARD_CAPS.maxDailyLossPct),
  minRiskReward: z.number().finite().min(0).max(RISK_HARD_CAPS.minRiskReward),
  maxPortfolioExposurePct: percentageSchema.max(RISK_HARD_CAPS.maxPortfolioExposurePct).optional(),
  maxDrawdownPct: percentageSchema.max(RISK_HARD_CAPS.maxDrawdownPct).optional(),
  maxVolatilityPct: percentageSchema.max(RISK_HARD_CAPS.maxVolatilityPct).optional(),
  newsEventRestrictions: z.boolean().optional(),
};

/** README §14.4 — full order evaluation including profile overrides. */
export const riskEvaluateProfileSchema = z.strictObject(cappedProfileFields);

export const riskEvaluateSchema = z.strictObject({
  order: z.strictObject({
    symbol: symbolSchema,
    side: z.enum(['LONG', 'SHORT']),
    entry: positiveMoneySchema,
    stopLoss: positiveMoneySchema,
    takeProfit: positiveMoneySchema,
    size: positiveMoneySchema,
  }),
  profile: riskEvaluateProfileSchema.optional(),
});

/** Optional live context. When omitted the service reads DB/server state. */
export const riskContextSchema = z.strictObject({
  balance: positiveMoneySchema.optional(),
  equity: positiveMoneySchema.optional(),
  volatilityPct: z.number().finite().min(0).optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
  dataFreshnessSeconds: z.number().finite().min(0).optional(),
  missingFeatures: z.array(z.string().min(1)).optional(),
  openPositions: z.number().int().min(0).optional(),
  dailyLossPct: z.number().finite().min(0).optional(),
  drawdownPct: z.number().finite().min(0).optional(),
  portfolioExposurePct: z.number().finite().min(0).optional(),
  correlatedExposurePct: z.number().finite().min(0).optional(),
  imminentEvents: z
    .array(
      z.strictObject({
        eventName: z.string().min(1),
        currency: z.string().min(1),
        minutesUntil: z.number().finite().min(0).optional(),
      }),
    )
    .optional(),
  asOf: dateTimeSchema.optional(),
});

/** The route accepts the documented `order`/`profile` shape plus context. */
export const riskEvaluateRequestSchema = z.strictObject({
  order: riskEvaluateSchema.shape.order,
  profile: riskEvaluateProfileSchema.optional(),
  context: riskContextSchema.optional(),
});

export const riskProfileSchema = z.strictObject({
  name: z.enum(['Conservative', 'Moderate', 'Aggressive']),
  ...cappedProfileFields,
});

export type RiskCalculateInput = z.infer<typeof riskCalculateSchema>;
export type RiskEvaluateInput = z.infer<typeof riskEvaluateSchema>;
export type RiskEvaluateRequest = z.infer<typeof riskEvaluateRequestSchema>;
export type RiskContextInput = z.infer<typeof riskContextSchema>;
export type RiskProfileInput = z.infer<typeof riskProfileSchema>;
