import type {
  Candle,
  HistoricalAnalysisView,
  HistoricalPeriodChange,
  HistoricalVolatilityStats,
  SimilarHistoricalWindow,
  Timeframe,
} from '@ts/types';
import { TIMEFRAME_MINUTES } from '../market/timeframes';

const PERIOD_DAYS: ReadonlyArray<[HistoricalPeriodChange['period'], number]> = [
  ['previous_day', 1],
  ['previous_week', 7],
  ['previous_month', 30],
  ['previous_year', 365],
];

const WINDOW = 20;

function returns(candles: readonly Candle[]): number[] {
  const result: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1].close;
    if (previous > 0) result.push(Math.log(candles[index].close / previous));
  }
  return result;
}

/** Real OHLC aggregations over stored candles — no synthetic rows. */
export function periodChanges(candles: readonly Candle[], asOf: Date): HistoricalPeriodChange[] {
  return PERIOD_DAYS.map(([period, days]) => {
    const from = asOf.getTime() - days * 86_400_000;
    const window = candles.filter((candle) => {
      const time = Date.parse(candle.timestamp);
      return time > from && time <= asOf.getTime();
    });
    const open = window[0]?.open ?? 0;
    const close = window[window.length - 1]?.close ?? 0;
    return {
      period,
      from: new Date(from).toISOString(),
      to: asOf.toISOString(),
      open,
      close,
      changePct: open > 0 ? ((close - open) / open) * 100 : 0,
      high: window.length > 0 ? Math.max(...window.map((candle) => candle.high)) : 0,
      low: window.length > 0 ? Math.min(...window.map((candle) => candle.low)) : 0,
      candles: window.length,
    };
  });
}

/** README §9.3 — annualized realized volatility from log returns. */
export function volatilityStats(
  candles: readonly Candle[],
  timeframe: Timeframe,
  asOf: Date,
): HistoricalVolatilityStats {
  const values = returns(candles);
  const mean =
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const variance =
    values.length > 1
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
      : 0;
  const periodPct = Math.sqrt(Math.max(0, variance)) * 100;
  const barsPerYear = (365 * 24 * 60) / TIMEFRAME_MINUTES[timeframe];
  return {
    timeframe,
    annualizedPct: periodPct * Math.sqrt(barsPerYear),
    periodPct,
    sampleSize: values.length,
    asOf: asOf.toISOString(),
  };
}

function normalizeShape(values: readonly number[]): number[] {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length,
  );
  if (deviation < 1e-12) return values.map(() => 0);
  return values.map((value) => (value - mean) / deviation);
}

/**
 * P09 skeleton: deterministic shape match on normalized log-return windows.
 * P12 replaces this with feature-space nearest neighbors; the ranking here is
 * already computed from real candles and needs no AI service.
 */
export function similarWindows(
  candles: readonly Candle[],
  limit: number,
): SimilarHistoricalWindow[] {
  if (candles.length < WINDOW * 2) return [];
  const values = returns(candles);
  const target = normalizeShape(values.slice(-WINDOW));
  const scored: SimilarHistoricalWindow[] = [];
  for (let end = WINDOW; end <= values.length - WINDOW; end += 1) {
    const candidate = normalizeShape(values.slice(end - WINDOW, end));
    const squared = candidate.reduce((sum, value, index) => sum + (value - target[index]) ** 2, 0);
    const anchor = candles[end];
    const previous = candles[end - 1];
    scored.push({
      timestamp: anchor.timestamp,
      distance: Math.sqrt(squared / WINDOW),
      close: anchor.close,
      changePct: previous.close > 0 ? ((anchor.close - previous.close) / previous.close) * 100 : 0,
    });
  }
  return scored
    .sort((a, b) => a.distance - b.distance || a.timestamp.localeCompare(b.timestamp))
    .slice(0, limit);
}

export function aggregateHistorical(input: {
  symbol: string;
  timeframe: Timeframe;
  asOf: Date;
  candles: readonly Candle[];
  limit: number;
}): HistoricalAnalysisView {
  return {
    symbol: input.symbol,
    timeframe: input.timeframe,
    asOf: input.asOf.toISOString(),
    periods: periodChanges(input.candles, input.asOf),
    volatility: volatilityStats(input.candles, input.timeframe, input.asOf),
    similarConditions: similarWindows(input.candles, input.limit),
    similarityMethod: 'deterministic-euclidean',
    dataPoints: input.candles.length,
  };
}
