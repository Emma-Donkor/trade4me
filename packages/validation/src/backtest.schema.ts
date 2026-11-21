import { z } from 'zod';
import {
  dateTimeSchema,
  percentageSchema,
  positiveMoneySchema,
  symbolSchema,
} from './common.schema';
import { timeframeSchema } from './ai';

/** README §16.1 — chronological, leakage-safe simulation configuration. */
export const backtestConfigSchema = z
  .strictObject({
    symbol: symbolSchema,
    strategy: z.string().min(1).max(80),
    timeframe: timeframeSchema,
    rangeStart: dateTimeSchema,
    rangeEnd: dateTimeSchema,
    startingCapital: positiveMoneySchema,
    riskPerTradePct: percentageSchema,
    spreadPips: z.number().finite().min(0).optional(),
    slippagePips: z.number().finite().min(0).optional(),
  })
  .refine((value) => Date.parse(value.rangeEnd) > Date.parse(value.rangeStart), {
    message: 'rangeEnd must be after rangeStart',
    path: ['rangeEnd'],
  });

export type BacktestConfigInput = z.infer<typeof backtestConfigSchema>;
