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

/** P14 — a drifting model is down-weighted, never silently trusted. */
export const DRIFT_SIGNAL_WEIGHT = 0.25;

/** P14 — cache lifetime for version-keyed predictions. */
export const PREDICTION_CACHE_TTL_SECONDS = 300;

/** P14 — default analysis horizon (one hour) in minutes. */
export const DEFAULT_PREDICTION_HORIZON_MINUTES = 60;

/**
 * P15 — absolute ceilings. These mirror README §14.3's Aggressive template:
 * a user override may never exceed them, whatever the profile says.
 */
export const RISK_HARD_CAPS = {
  riskPerTradePct: 2,
  maxOpenPositions: 8,
  maxDailyLossPct: 5,
  minRiskReward: 10,
  maxPortfolioExposurePct: 50,
  maxDrawdownPct: 20,
  maxVolatilityPct: 40,
} as const;

/** P15 — default sizing inputs when no account/pair metadata is available. */
export const DEFAULT_ACCOUNT_BALANCE = 10_000;
export const DEFAULT_PIP_SIZE = 0.0001;
export const DEFAULT_POINT_VALUE = 10;
export const JPY_PIP_SIZE = 0.01;
export const JPY_POINT_VALUE = 9.09;

/** P15 — rule thresholds not owned by the risk profile. */
export const MIN_RISK_CONFIDENCE = 0.6;
export const MIN_RISK_CONFIDENCE_WARN = 0.75;
export const MAX_CORRELATED_EXPOSURE_PCT = 15;
export const NEWS_RISK_WINDOW_MINUTES = 60;
export const EXPOSURE_WARN_PCT = 5;
export const EXPOSURE_HIGH_PCT = 15;

/** P15 — README §14.3 templates, capped by RISK_HARD_CAPS. */
export const RISK_PROFILE_TEMPLATES = {
  CONSERVATIVE: {
    name: 'Conservative',
    riskPerTradePct: 0.5,
    maxOpenPositions: 3,
    maxDailyLossPct: 1.5,
    minRiskReward: 2,
    maxPortfolioExposurePct: 10,
    maxDrawdownPct: 5,
    maxVolatilityPct: 15,
    newsEventRestrictions: true,
  },
  MODERATE: {
    name: 'Moderate',
    riskPerTradePct: 1,
    maxOpenPositions: 5,
    maxDailyLossPct: 3,
    minRiskReward: 1.5,
    maxPortfolioExposurePct: 25,
    maxDrawdownPct: 10,
    maxVolatilityPct: 25,
    newsEventRestrictions: true,
  },
  AGGRESSIVE: {
    name: 'Aggressive',
    riskPerTradePct: 2,
    maxOpenPositions: 8,
    maxDailyLossPct: 5,
    minRiskReward: 1.2,
    maxPortfolioExposurePct: 50,
    maxDrawdownPct: 20,
    maxVolatilityPct: 40,
    newsEventRestrictions: false,
  },
} as const;
