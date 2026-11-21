import { z } from 'zod';
import { positiveMoneySchema, symbolSchema } from './common.schema';

export interface OrderGeometry {
  side: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  takeProfit: number;
}

/** A stop below entry on a long (above on a short) is the P05 hard rule. */
export function stopAndTargetOnCorrectSide(order: OrderGeometry): boolean {
  return order.side === 'LONG'
    ? order.stopLoss < order.entry && order.takeProfit > order.entry
    : order.stopLoss > order.entry && order.takeProfit < order.entry;
}

export function riskRewardOf(order: OrderGeometry): number {
  const stopDistance = Math.abs(order.entry - order.stopLoss);
  if (stopDistance === 0) return -1;
  return Math.abs(order.takeProfit - order.entry) / stopDistance;
}

/** README §17.1 — every simulated order passes this before the risk engine. */
export const paperOrderSchema = z
  .strictObject({
    symbol: symbolSchema,
    side: z.enum(['LONG', 'SHORT']),
    entry: positiveMoneySchema,
    stopLoss: positiveMoneySchema,
    takeProfit: positiveMoneySchema,
    size: positiveMoneySchema,
  })
  .refine(stopAndTargetOnCorrectSide, {
    message: 'Stop loss and take profit must be on the correct side of entry',
    path: ['stopLoss'],
  })
  .refine((order) => riskRewardOf(order) > 0, {
    message: 'Risk/reward must be greater than 0',
    path: ['takeProfit'],
  });

export const modifyPositionSchema = z
  .strictObject({
    stopLoss: positiveMoneySchema.optional(),
    takeProfit: positiveMoneySchema.optional(),
  })
  .refine((value) => value.stopLoss !== undefined || value.takeProfit !== undefined, {
    message: 'At least one of stopLoss or takeProfit is required',
  });

export type PaperOrderInput = z.infer<typeof paperOrderSchema>;
export type ModifyPositionInput = z.infer<typeof modifyPositionSchema>;
