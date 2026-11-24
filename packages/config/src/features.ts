/**
 * PHASE 12 feature contract mirror.
 *
 * Python owns the canonical definitions and checksum in
 * `apps/ai-engine/app/services/feature_manifest_v1.json`. This list lets the
 * Node API validate every persisted vector before prediction/scoring and
 * similarity search consume it. Changing it without a FEATURE_VERSION bump
 * fails the cross-language parity guard.
 */

export const FEATURE_MANIFEST_VERSION = 'v1.0' as const;
export const FEATURE_MANIFEST_CHECKSUM =
  '7b05adc6dd15cb81b6c5f21a0f681b346c521e95cccf204cef9d19b75046a7af' as const;

export const FEATURE_NAMES: readonly string[] = [
  'rsi14',
  'macd_line_atr',
  'macd_signal_atr',
  'macd_hist_atr',
  'ema20_distance_pct',
  'ema50_distance_pct',
  'ema200_distance_pct',
  'adx14',
  'bollinger_width_pct',
  'atr_pct',
  'return_1',
  'return_4',
  'return_12',
  'return_24',
  'realized_vol_pct',
  'parkinson_vol_pct',
  'atr_percentile',
  'distance_to_support_atr',
  'distance_to_resistance_atr',
  'regime_STRONG_UPTREND',
  'regime_WEAK_UPTREND',
  'regime_RANGE',
  'regime_WEAK_DOWNTREND',
  'regime_STRONG_DOWNTREND',
  'regime_HIGH_VOLATILITY',
  'regime_LOW_VOLATILITY',
  'regime_UNCERTAIN',
  'news_sentiment',
  'news_impact',
  'minutes_to_high_event',
  'currency_strength_index',
  'correlation_vs_majors',
  'time_of_day_utc',
  'day_of_week',
  'session_asia',
  'session_london',
  'session_overlap',
  'session_new_york',
  'dow_mon',
  'dow_tue',
  'dow_wed',
  'dow_thu',
  'dow_fri',
  'dow_sat',
  'dow_sun',
  'levels_missing',
  'news_missing',
  'events_missing',
  'regime_missing',
  'cross_missing',
];

export const FEATURE_COUNT = FEATURE_NAMES.length;
