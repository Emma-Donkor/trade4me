import type { Candle, Timeframe } from '@ts/types';
import type { ProviderPairContext } from './provider.interface';
import { PROVIDER_CANDLE_CHUNK, timeframeStepMs } from '../timeframes';

/** Keyless deterministic data: the same symbol + bucket always repeats. */
const REFERENCE_PRICES: Record<string, number> = {
  'EUR/USD': 1.085,
  'GBP/USD': 1.27,
  'USD/JPY': 148.5,
  'USD/CHF': 0.905,
  'AUD/USD': 0.665,
  'USD/CAD': 1.355,
  'NZD/USD': 0.605,
  'EUR/GBP': 0.855,
  'EUR/JPY': 161.2,
  'GBP/JPY': 188.4,
};

export function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function mockDecimals(context?: ProviderPairContext): number {
  if (context?.quoteDecimals !== undefined) return context.quoteDecimals;
  if (context?.pipSize !== undefined) {
    return Math.min(8, Math.ceil(-Math.log10(context.pipSize)) + 1);
  }
  return 5;
}

export function pipSizeFor(context?: ProviderPairContext): number {
  return context?.pipSize ?? 0.0001;
}

export function basePriceFor(symbol: string): number {
  return REFERENCE_PRICES[symbol] ?? 1 + (hash(symbol) % 40_000) / 10_000;
}

export function walk(symbol: string, bucket: number, steps: number): () => number {
  return mulberry32(hash(`${symbol}:${bucket}:${steps}`));
}

/**
 * Deterministic OHLC used by both the mock adapter and the history seed.
 * No RNG state is shared between calls, so re-running a range is idempotent.
 */
export function generateMockCandles(
  symbol: string,
  timeframe: Timeframe,
  start: Date,
  end: Date,
  context?: ProviderPairContext,
  provider = 'mock',
): Candle[] {
  if (start.getTime() > end.getTime()) return [];
  const stepMs = timeframeStepMs(timeframe);
  const stepMinutes = stepMs / 60_000;
  const decimals = mockDecimals(context);
  const candles: Candle[] = [];
  const firstBucket = Math.floor(start.getTime() / stepMs);
  const lastBucket = Math.floor(end.getTime() / stepMs);
  for (
    let bucket = firstBucket;
    bucket <= lastBucket && candles.length < PROVIDER_CANDLE_CHUNK;
    bucket += 1
  ) {
    const random = walk(symbol, bucket, stepMinutes);
    const open = roundTo(basePriceFor(symbol) * (1 + (random() - 0.5) * 0.004), decimals);
    const close = roundTo(open * (1 + (random() - 0.5) * 0.003), decimals);
    const wick = Math.max(10 ** -decimals, roundTo(open * 0.0004 * (0.5 + random()), decimals));
    const high = roundTo(Math.max(open, close) + wick, decimals);
    const low = roundTo(Math.min(open, close) - wick, decimals);
    candles.push({
      symbol,
      timeframe,
      timestamp: new Date(bucket * stepMs).toISOString(),
      open,
      high,
      low,
      close,
      volume: null,
      provider,
    });
  }
  return candles;
}
