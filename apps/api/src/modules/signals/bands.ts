import { SCORE_BANDS } from '@ts/config';
import type { SignalScoreBand } from '@ts/types';

/**
 * README §15.2 — one authoritative mapping from the config manifest.
 *
 * Bands are declared as integer ranges, but component scores are rounded to
 * two decimals. Treat each band's upper edge as exclusive against the next
 * band's lower edge so 79.99 remains "Good setup" rather than falling through.
 */
export function bandForScore(score: number): string {
  if (!Number.isFinite(score) || score < 0 || score > 100) return 'Avoid';
  const ascending = [...SCORE_BANDS].sort((left, right) => left.min - right.min);
  const match = ascending.find((band, position) => {
    if (score < band.min) return false;
    const next = ascending[position + 1];
    return next === undefined ? score <= band.max : score < next.min;
  });
  return match?.label ?? 'Avoid';
}

export function scoreBands(): readonly SignalScoreBand[] {
  return SCORE_BANDS;
}
