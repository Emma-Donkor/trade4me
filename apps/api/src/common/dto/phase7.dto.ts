import { idSchema, symbolSchema, watchlistItemSchema, z } from '@ts/validation';

export const idParamSchema = z.strictObject({ id: idSchema });

export const idQuerySchema = z.strictObject({ id: idSchema.optional() });

export const addWatchlistItemSchema = watchlistItemSchema.extend({
  sortOrder: z.number().int().min(0).optional(),
});

export const removeWatchlistItemQuerySchema = z
  .strictObject({
    id: idSchema.optional(),
    symbol: symbolSchema.optional(),
  })
  .refine((value) => value.id !== undefined || value.symbol !== undefined, {
    message: 'Provide either an item id or a symbol',
  });
