import { z } from 'zod';
import type { UpdateProfileInput, UpdateRiskProfileInput } from '@ts/types';

const nullableName = z.string().min(1).max(120).nullable();
const percent = z.number().finite().min(0);

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
    riskPerTradePct: percent.max(2).optional(),
    maxOpenPositions: z.number().int().min(1).max(50).optional(),
    maxDailyLossPct: percent.max(100).optional(),
    minRiskReward: z.number().finite().min(0).max(100).optional(),
    maxPortfolioExposurePct: percent.max(100).optional(),
    maxDrawdownPct: percent.max(100).optional(),
    maxVolatility: percent.max(100).optional(),
    newsEventRestrictions: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one risk setting is required',
  }) satisfies z.ZodType<UpdateRiskProfileInput>;

export type { UpdateProfileInput, UpdateRiskProfileInput } from '@ts/types';
