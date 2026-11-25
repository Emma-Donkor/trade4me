import { z } from 'zod';
import type { UpdateProfileInput, UpdateRiskProfileInput } from '@ts/types';
import { RISK_HARD_CAPS } from './risk.schema';

const nullableName = z.string().min(1).max(120).nullable();

/** P06 user settings; unknown keys are rejected so clients cannot escalate. */
export const updateProfileSchema = z.strictObject({
  firstName: nullableName.optional(),
  lastName: nullableName.optional(),
  timezone: z.string().min(1).max(64).optional(),
  baseCurrency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase())
    .optional(),
  experienceLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
  avatarUrl: z.url().nullable().optional(),
}) satisfies z.ZodType<UpdateProfileInput>;

export const updateRiskProfileSchema = z
  .strictObject({
    profileType: z.enum(['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE']).optional(),
    riskPerTradePct: z.number().finite().min(0).max(RISK_HARD_CAPS.riskPerTradePct).optional(),
    maxOpenPositions: z.number().int().min(1).max(RISK_HARD_CAPS.maxOpenPositions).optional(),
    maxDailyLossPct: z.number().finite().min(0).max(RISK_HARD_CAPS.maxDailyLossPct).optional(),
    minRiskReward: z.number().finite().min(0).max(RISK_HARD_CAPS.minRiskReward).optional(),
    maxPortfolioExposurePct: z
      .number()
      .finite()
      .min(0)
      .max(RISK_HARD_CAPS.maxPortfolioExposurePct)
      .optional(),
    maxDrawdownPct: z.number().finite().min(0).max(RISK_HARD_CAPS.maxDrawdownPct).optional(),
    maxVolatility: z.number().finite().min(0).max(RISK_HARD_CAPS.maxVolatilityPct).optional(),
    newsEventRestrictions: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one risk setting is required',
  }) satisfies z.ZodType<UpdateRiskProfileInput>;

export type { UpdateProfileInput, UpdateRiskProfileInput } from '@ts/types';
