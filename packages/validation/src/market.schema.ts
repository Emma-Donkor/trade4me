import { z } from 'zod';
import { dateTimeSchema, nonEmptyString, paginationSchema, symbolSchema } from './common.schema';
import { timeframeSchema } from './ai';

/** README §P09 — bounded ranges prevent DoS scans of deep history. */
export const MAX_CANDLE_RANGE_DAYS = 3 * 366;

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
    /** Keyset cursor for deep history; encoded as an opaque base64 string. */
    cursor: nonEmptyString.optional(),
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
  )
  .refine(
    (value) => {
      const from = value.from ?? value.start;
      const to = value.to ?? value.end;
      if (!from || !to) return true;
      const spanDays = (Date.parse(to) - Date.parse(from)) / 86_400_000;
      return spanDays <= MAX_CANDLE_RANGE_DAYS;
    },
    {
      message: `Range must not exceed ${String(MAX_CANDLE_RANGE_DAYS)} days`,
      path: ['end'],
    },
  );

const commaSeparatedSymbolsSchema = z.string().refine(
  (value) => {
    const symbols = value.split(',').map((symbol) => symbol.trim());
    return symbols.length > 0 && symbols.every((symbol) => symbolSchema.safeParse(symbol).success);
  },
  { message: 'Expected a comma-separated list of pairs such as EUR/USD,GBP/USD' },
);

/** Query strings are strings; `z.coerce.boolean()` would treat `false` as true. */
const queryBoolean = z.preprocess((value) => {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
}, z.boolean());

export const quoteQuerySchema = z
  .strictObject({
    symbol: symbolSchema.optional(),
    symbols: z.union([commaSeparatedSymbolsSchema, z.array(symbolSchema).min(1)]).optional(),
    /** README §9.2 — refuse stale/unavailable quotes with MARKET_DATA_STALE. */
    freshOnly: queryBoolean.optional().default(false),
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

/** README §9.3 — historical aggregation query (similarity NN arrives in P12). */
export const historicalQuerySchema = z.strictObject({
  timeframe: timeframeSchema.optional().default('D1'),
  limit: z.coerce.number().int().positive().max(50).optional().default(5),
});

export type CandleRangeQuery = z.infer<typeof candleRangeQuerySchema>;
export type HistoricalQuery = z.infer<typeof historicalQuerySchema>;
export type QuoteQuery = z.infer<typeof quoteQuerySchema>;
export type SymbolParam = z.infer<typeof symbolParamSchema>;
export type ScannerQuery = z.infer<typeof scannerQuerySchema>;
export type NewsFeedQuery = z.infer<typeof newsFeedQuerySchema>;
export type IndicatorsQuery = z.infer<typeof indicatorsQuerySchema>;
