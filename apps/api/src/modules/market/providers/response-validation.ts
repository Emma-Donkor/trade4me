import type { Candle, MarketQuote, Timeframe } from '@ts/types';
import { decimalPlaces, z } from '@ts/validation';
import type { ProviderPairContext } from './provider.interface';
import { ProviderError, type ProviderErrorKind } from './provider.errors';

const MAX_FUTURE_SKEW_MS = 5_000;

function fail(kind: ProviderErrorKind, message: string, details?: Record<string, unknown>): never {
  throw new ProviderError(kind, message, { details });
}

/** Providers variously send numbers as JSON numbers or numeric strings. */
const flexibleNumber = z.union([
  z.number().finite(),
  z
    .string()
    .trim()
    .min(1)
    .regex(/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i)
    .transform(Number),
]);

const flexibleTimestamp = z.union([z.string().min(1), z.number().finite()]);

export const providerQuoteSchema = z
  .object({
    symbol: z.string().min(1).optional(),
    bid: flexibleNumber.optional(),
    ask: flexibleNumber.optional(),
    price: flexibleNumber.optional(),
    mid: flexibleNumber.optional(),
    spread: flexibleNumber.optional(),
    timestamp: flexibleTimestamp.optional(),
    datetime: z.string().min(1).optional(),
    time: flexibleTimestamp.optional(),
    status: z.string().optional(),
    code: z.number().int().optional(),
    message: z.string().optional(),
    Note: z.string().optional(),
    Information: z.string().optional(),
    'Error Message': z.string().optional(),
  })
  .passthrough();

/** Adapters may hand over strings before coercion; both shapes are accepted. */
export type RawProviderQuoteInput = z.input<typeof providerQuoteSchema>;
export type RawProviderQuote = z.infer<typeof providerQuoteSchema>;

/** Coerces an untrusted adapter field without throwing; validation does that. */
export function coerceProviderNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = flexibleNumber.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function coerceProviderTimestamp(value: unknown): string | number | undefined {
  if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
    return value;
  }
  return undefined;
}

export const providerCandleSchema = z
  .object({
    datetime: z.string().optional(),
    timestamp: flexibleTimestamp.optional(),
    time: flexibleTimestamp.optional(),
    open: flexibleNumber.optional(),
    high: flexibleNumber.optional(),
    low: flexibleNumber.optional(),
    close: flexibleNumber.optional(),
    // Mock pairs have no volume; `null` means "not provided", not malformed.
    volume: flexibleNumber.nullable().optional(),
  })
  .passthrough();

/** README §9.2 — malformed or hostile payloads never reach the database. */
export function parseProviderQuote(raw: unknown, provider: string): RawProviderQuote {
  const parsed = providerQuoteSchema.safeParse(raw);
  if (!parsed.success) {
    fail('malformed', `Malformed quote payload from ${provider}`, {
      provider,
      issues: parsed.error.issues.map((issue) => issue.path.join('.')),
    });
  }
  const quote = parsed.data;
  if (quote.status === 'error') {
    const kind: ProviderErrorKind = quote.code === 429 ? 'quota' : 'malformed';
    fail(kind, `Provider ${provider} reported an error payload`, { provider, code: quote.code });
  }
  if (quote.Note || quote.Information) {
    fail('quota', `Provider ${provider} quota payload received`, { provider });
  }
  if (quote['Error Message']) {
    fail('malformed', `Provider ${provider} rejected the requested symbol`, { provider });
  }
  return quote;
}

export function parseProviderCandles(raw: unknown, provider: string): unknown[] {
  if (Array.isArray(raw)) return raw;
  const value = raw as Record<string, unknown> | null;
  const series =
    value?.values ?? Object.entries(value ?? {}).find(([key]) => /^time series/i.test(key))?.[1];
  if (Array.isArray(series)) return series;
  if (series && typeof series === 'object') {
    return Object.entries(series as Record<string, unknown>).map(([timestamp, candle]) => ({
      timestamp,
      ...(candle as Record<string, unknown>),
    }));
  }
  if (value?.Note || value?.Information)
    fail('quota', `Provider ${provider} quota payload received`);
  fail('malformed', `Malformed candle payload from ${provider}`);
}

function toDate(value: unknown, provider: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) fail('malformed', `Invalid timestamp from ${provider}`);
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Provider epoch seconds are far more common than epoch milliseconds.
    const millis = value < 1e11 ? value * 1_000 : value;
    const date = new Date(millis);
    if (Number.isNaN(date.getTime())) fail('malformed', `Invalid timestamp from ${provider}`);
    return date;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && /^\d+$/.test(value.trim())) return toDate(numeric, provider);
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return fail('malformed', `Invalid timestamp from ${provider}`, {
    timestamp: typeof value === 'string' ? value.slice(0, 40) : undefined,
  });
}

/**
 * README §9.2 — future and out-of-order stamps are rejected (never repaired).
 * Callers log the rejection as a SystemEvent and fail over.
 */
export function assertValidTimestamp(
  timestamp: unknown,
  options: {
    provider: string;
    now?: Date;
    previous?: Date | string | null;
    maxFutureSkewMs?: number;
  },
): Date {
  const date = toDate(timestamp, options.provider);
  const now = options.now ?? new Date();
  const skew = options.maxFutureSkewMs ?? MAX_FUTURE_SKEW_MS;
  if (date.getTime() > now.getTime() + skew) {
    fail('invalid_timestamp', `Future timestamp from ${options.provider}`, {
      provider: options.provider,
      reason: 'future',
      timestamp: date.toISOString(),
    });
  }
  if (options.previous) {
    const previous = toDate(options.previous, options.provider);
    if (date.getTime() <= previous.getTime()) {
      fail('invalid_timestamp', `Out-of-order timestamp from ${options.provider}`, {
        provider: options.provider,
        reason: 'out-of-order',
        timestamp: date.toISOString(),
        previous: previous.toISOString(),
      });
    }
  }
  return date;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function decimalsFor(context: ProviderPairContext | undefined): number {
  if (context?.quoteDecimals !== undefined) {
    if (
      !Number.isInteger(context.quoteDecimals) ||
      context.quoteDecimals < 1 ||
      context.quoteDecimals > 8
    ) {
      fail('malformed', 'Invalid quote decimal precision');
    }
    return context.quoteDecimals;
  }
  if (context?.pipSize !== undefined) {
    if (!Number.isFinite(context.pipSize) || context.pipSize <= 0) {
      fail('malformed', 'Invalid pair pip size');
    }
    return Math.min(8, Math.ceil(-Math.log10(context.pipSize)) + 1);
  }
  return 8;
}

function positivePrice(
  value: number | undefined,
  field: string,
  provider: string,
  decimals: number,
): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    fail('malformed', `Invalid ${field} from ${provider}`, { provider, field });
  }
  if (decimalPlaces(value) > decimals) {
    fail('malformed', `${field} from ${provider} exceeds pair precision`, { provider, field });
  }
  return roundTo(value, decimals);
}

/** Schema → numeric sanity → decimal precision → typed MarketQuote. */
export function normalizeQuote(
  raw: RawProviderQuoteInput,
  symbol: string,
  provider: string,
  context?: ProviderPairContext,
  now: Date = new Date(),
): MarketQuote {
  const decimals = decimalsFor(context);
  const timestamp = assertValidTimestamp(raw.timestamp ?? raw.datetime ?? raw.time, {
    provider,
    now,
  });
  const pipSize = context?.pipSize ?? 10 ** -(decimals - 1);
  const typicalSpread = (context?.spreadPipsTypical ?? 1) * pipSize;

  const bid = positivePrice(
    coerceProviderNumber(raw.bid ?? raw.price ?? raw.mid),
    'bid',
    provider,
    decimals,
  );
  const ask = positivePrice(
    coerceProviderNumber(raw.ask) ?? bid + typicalSpread,
    'ask',
    provider,
    decimals,
  );
  if (ask < bid) fail('malformed', `Ask below bid from ${provider}`, { provider });

  const spread = positivePrice(
    coerceProviderNumber(raw.spread) ?? roundTo(ask - bid, decimals),
    'spread',
    provider,
    decimals,
  );
  const expectedSpread = roundTo(ask - bid, decimals);
  const tolerance = Math.max(10 ** -decimals, expectedSpread * 0.05);
  if (Math.abs(spread - expectedSpread) > tolerance) {
    fail('malformed', `Inconsistent spread from ${provider}`, { provider });
  }

  return {
    symbol,
    bid,
    ask,
    spread,
    timestamp: timestamp.toISOString(),
    provider,
  };
}

/** OHLC consistency is enforced before any candle is persisted. */
export function normalizeCandle(
  raw: unknown,
  symbol: string,
  timeframe: Timeframe,
  provider: string,
  options: { now?: Date; previous?: Date | string | null; context?: ProviderPairContext } = {},
): Candle {
  const parsed = providerCandleSchema.safeParse(raw);
  if (!parsed.success) {
    fail('malformed', `Malformed candle from ${provider}`, {
      provider,
      issues: parsed.error.issues.map((issue) => issue.path.join('.')),
    });
  }
  const row = parsed.data as Record<string, unknown> & {
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    '1. open'?: string;
    '2. high'?: string;
    '3. low'?: string;
    '4. close'?: string;
    '5. volume'?: string;
  };
  const decimals = decimalsFor(options.context);
  const pick = (...candidates: unknown[]): number => {
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null || candidate === '') continue;
      const parsedNumber = flexibleNumber.safeParse(candidate);
      if (parsedNumber.success) return parsedNumber.data;
    }
    return fail('malformed', `Missing OHLC value from ${provider}`, { provider });
  };
  const open = positivePrice(pick(row.open, row['1. open']), 'open', provider, decimals);
  const high = positivePrice(pick(row.high, row['2. high']), 'high', provider, decimals);
  const low = positivePrice(pick(row.low, row['3. low']), 'low', provider, decimals);
  const close = positivePrice(pick(row.close, row['4. close']), 'close', provider, decimals);
  if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
    fail('malformed', `Inconsistent OHLC from ${provider}`, {
      provider,
      open,
      high,
      low,
      close,
    });
  }
  const timestamp = assertValidTimestamp(row.timestamp ?? row.datetime ?? row.time, {
    provider,
    now: options.now ?? new Date(),
    previous: options.previous,
  });
  const volumeRaw = row.volume ?? row['5. volume'];
  const volume = volumeRaw === undefined ? null : flexibleNumber.safeParse(volumeRaw);
  if (volume && !volume.success) fail('malformed', `Invalid volume from ${provider}`, { provider });

  return {
    symbol,
    timeframe,
    timestamp: timestamp.toISOString(),
    open,
    high,
    low,
    close,
    volume: volume?.data ?? null,
    provider,
  };
}
