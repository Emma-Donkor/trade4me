export const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN1'] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

export interface ScoreBand {
  min: number;
  max: number;
  label: string;
}

export const SCORE_BANDS: readonly ScoreBand[] = [
  { min: 80, max: 100, label: 'Strong setup' },
  { min: 70, max: 79, label: 'Good setup' },
  { min: 60, max: 69, label: 'Watch' },
  { min: 50, max: 59, label: 'Weak' },
  { min: 0, max: 49, label: 'Avoid' },
];

export const HEALTH_CHECK_TIMEOUT_MS = 2000;

/** README §8.5: /ai/* is limited to 20 requests per user per window. */
export const AI_RATE_LIMIT_MAX = 20;
