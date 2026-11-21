import { z } from 'zod';
import { dateTimeSchema, paginationSchema, symbolSchema } from './common.schema';
import { timeframeSchema } from './ai';

/** README §9 — a bounded OHLC request; the repository always paginates it. */
export const candleRangeQuerySchema = z
  .strictObject({
    symbol: symbolSchema,
    timeframe: timeframeSchema,
    from: dateTimeSchema,
    to: dateTimeSchema,
    page: paginationSchema.shape.page,
    pageSize: paginationSchema.shape.pageSize,
    order: z.enum(['asc', 'desc']).optional(),
  })
  .refine((value) => Date.parse(value.from) <= Date.parse(value.to), {
    message: 'from must not be after to',
    path: ['from'],
  });

export const quoteQuerySchema = z.strictObject({
  symbol: symbolSchema,
});

export const symbolParamSchema = z.strictObject({
  symbol: symbolSchema,
});

/** README §15.4 — scanner sort keys are an exhaustive union. */
export const scannerQuerySchema = z.strictObject({
  sortBy: z.enum(['score', 'probability', 'risk', 'volatility']).default('score'),
  order: z.enum(['asc', 'desc']).default('desc'),
  action: z.enum(['LONG', 'SHORT', 'WATCH', 'NO_TRADE']).optional(),
});

/** README §11 — news feed filters. */
export const newsFeedQuerySchema = z.strictObject({
  currency: z.string().length(3).toUpperCase().optional(),
  sentiment: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).optional(),
  impact: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EXTREME']).optional(),
  page: paginationSchema.shape.page,
  pageSize: paginationSchema.shape.pageSize,
});

export const indicatorsQuerySchema = z.strictObject({
  symbol: symbolSchema,
  timeframe: timeframeSchema,
  indicators: z.array(nonEmptyIndicator()).optional(),
});

function nonEmptyIndicator() {
  return z.string().min(1);
}

export type CandleRangeQuery = z.infer<typeof candleRangeQuerySchema>;
export type QuoteQuery = z.infer<typeof quoteQuerySchema>;
export type SymbolParam = z.infer<typeof symbolParamSchema>;
export type ScannerQuery = z.infer<typeof scannerQuerySchema>;
export type NewsFeedQuery = z.infer<typeof newsFeedQuerySchema>;
export type IndicatorsQuery = z.infer<typeof indicatorsQuerySchema>;
