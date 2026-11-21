import { z } from 'zod';
import { nonEmptyString, symbolSchema } from './common.schema';

export const createWatchlistSchema = z.strictObject({
  name: nonEmptyString.max(80),
});

export const watchlistItemSchema = z.strictObject({
  symbol: symbolSchema,
  alerts: z
    .object({
      priceAbove: z.number().finite().positive().optional(),
      priceBelow: z.number().finite().positive().optional(),
      scoreAbove: z.number().finite().min(0).max(100).optional(),
    })
    .optional(),
});

/** README §17.3 — order is explicit via sortOrder, never array index alone. */
export const watchlistReorderSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: nonEmptyString,
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1),
});

export type CreateWatchlistInput = z.infer<typeof createWatchlistSchema>;
export type WatchlistItemInput = z.infer<typeof watchlistItemSchema>;
export type WatchlistReorderInput = z.infer<typeof watchlistReorderSchema>;
