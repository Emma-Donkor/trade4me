import type { Timeframe } from '@ts/types';
import { bucketStart, timeframeStepMs } from './timeframes';

/** A reported hole, never a range to be interpolated or forward-filled. */
export interface CandleGap {
  pairId: string;
  symbol: string;
  timeframe: Timeframe;
  from: string;
  to: string;
  missing: number;
}

export interface GapScanInput {
  pairId: string;
  symbol: string;
  timeframe: Timeframe;
  from: Date;
  to: Date;
  timestamps: readonly (Date | string)[];
}

/**
 * README §9.2 — compares stored bucket starts with the expected clock grid.
 * Only reports holes; the only legal repair is a new provider request.
 */
export function detectCandleGaps(input: GapScanInput): CandleGap[] {
  const stepMs = timeframeStepMs(input.timeframe);
  const first = bucketStart(input.from.getTime(), stepMs);
  const last = bucketStart(input.to.getTime(), stepMs);
  if (last < first) return [];

  const buckets = new Set<number>();
  for (const value of input.timestamps) {
    const timeMs = value instanceof Date ? value.getTime() : Date.parse(value);
    if (!Number.isFinite(timeMs)) continue;
    const bucket = bucketStart(timeMs, stepMs);
    if (bucket >= first && bucket <= last) buckets.add(bucket);
  }
  const sorted = [...buckets].sort((a, b) => a - b);

  const gaps: CandleGap[] = [];
  let expected = first;
  const push = (fromBucket: number, toBucket: number): void => {
    gaps.push({
      pairId: input.pairId,
      symbol: input.symbol,
      timeframe: input.timeframe,
      from: new Date(fromBucket).toISOString(),
      to: new Date(toBucket).toISOString(),
      missing: (toBucket - fromBucket) / stepMs + 1,
    });
  };

  for (const bucket of sorted) {
    if (bucket > expected) push(expected, bucket - stepMs);
    expected = bucket + stepMs;
  }
  if (expected <= last) push(expected, last);
  return gaps;
}
