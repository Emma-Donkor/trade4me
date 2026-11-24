import type { Timeframe } from '@ts/types';

/** One authoritative minute map for generation, chunking and gap detection. */
export const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
  D1: 1_440,
  W1: 10_080,
  MN1: 43_200,
};

export const INTRADAY_TIMEFRAMES: readonly Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4'];
export const DAILY_TIMEFRAMES: readonly Timeframe[] = ['D1', 'W1', 'MN1'];

/** The two timeframes imported by the history seed and incremental sync. */
export const HISTORY_TIMEFRAMES: readonly Timeframe[] = ['D1', 'H1'];

/** Maximum candles returned by any provider adapter in a single request. */
export const PROVIDER_CANDLE_CHUNK = 500;

export function timeframeStepMs(timeframe: Timeframe): number {
  return TIMEFRAME_MINUTES[timeframe] * 60_000;
}

/** Aligns an arbitrary instant to the candle bucket it belongs to. */
export function bucketStart(timeMs: number, stepMs: number): number {
  return Math.floor(timeMs / stepMs) * stepMs;
}

/** How far back an empty pair is backfilled before incremental sync takes over. */
export function defaultLookbackMs(timeframe: Timeframe): number {
  return timeframeStepMs(timeframe) * (timeframe === 'D1' ? 365 : 90);
}

/** README §7.5 — intraday series expire in 60s, daily series in 1h. */
export function candleCacheTtlSeconds(timeframe: Timeframe): number {
  return DAILY_TIMEFRAMES.includes(timeframe) ? 3_600 : 60;
}
