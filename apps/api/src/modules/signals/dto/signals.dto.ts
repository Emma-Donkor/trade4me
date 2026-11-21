import { paginationSchema, scannerQuerySchema, symbolSchema, z } from '@ts/validation';

export const signalsQuerySchema = z.strictObject({
  action: z.enum(['LONG', 'SHORT', 'WATCH', 'NO_TRADE']).optional(),
  score: z.coerce.number().finite().min(0).max(100).optional(),
  symbol: symbolSchema.optional(),
  limit: paginationSchema.shape.limit,
  cursor: paginationSchema.shape.cursor,
});

export const scannerHttpQuerySchema = scannerQuerySchema.extend({
  limit: paginationSchema.shape.limit,
  cursor: paginationSchema.shape.cursor,
});

export type SignalsQuery = z.infer<typeof signalsQuerySchema>;
export type ScannerHttpQuery = z.infer<typeof scannerHttpQuerySchema>;
