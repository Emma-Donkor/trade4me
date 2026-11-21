import { z } from 'zod';
import { dateTimeSchema, paginationSchema, symbolSchema } from './common.schema';
import { timeframeSchema } from './ai';

/**
 * README §8.2/§9 — a bounded OHLC request. `start`/`end`/`limit` are the
 * documented query names; `from`/`to`/`pageSize` remain accepted aliases so
 * existing clients do not break while the shared contracts catch up.
 */
export const candleRangeQuerySchema = z
  .strictObject({
    symbol: symbolSchema,
    timeframe: timeframeSchema,
    from: dateTimeSchema.optional(),
    to: dateTimeSchema.optional(),
    start: dateTimeSchema.optional(),
    end: dateTimeSchema.optional(),
    limit: paginationSchema.shape.pageSize,
    page: paginationSchema.shape.page,
    pageSize: paginationSchema.shape.pageSize,
    order: z.enum(['asc', 'desc']).optional(),
  })
  .refine(
    (value) => {
      const from = value.from ?? value.start;
      const to = value.to ?? value.end;
      return from !== undefined && to !== undefined && Date.parse(from) <= Date.parse(to);
    },
    {
      message: 'start must be before end',
      path: ['start'],
    },
  );

const commaSeparatedSymbolsSchema = z.string().refine(
  (value) => {
    const symbols = value.split(',').map((symbol) => symbol.trim());
    return symbols.length > 0 && symbols.every((symbol) => symbolSchema.safeParse(symbol).success);
  },
  { message: 'Expected a comma-separated list of pairs such as EUR/USD,GBP/USD' },
);

export const quoteQuerySchema = z
  .strictObject({
    symbol: symbolSchema.optional(),
    symbols: z.union([commaSeparatedSymbolsSchema, z.array(symbolSchema).min(1)]).optional(),
  })
  .refine((value) => value.symbol !== undefined || value.symbols !== undefined, {
    message: 'symbol or symbols is required',
    path: ['symbols'],
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
