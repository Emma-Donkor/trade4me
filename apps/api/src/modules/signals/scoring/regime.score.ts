import type { MarketRegime } from '@ts/types';
import { component, evidence, type ComponentScore } from './component';

const REGIME_SCORES: Record<MarketRegime, number> = {
  STRONG_UPTREND: 90,
  WEAK_UPTREND: 70,
  RANGE: 50,
  WEAK_DOWNTREND: 30,
  STRONG_DOWNTREND: 10,
  HIGH_VOLATILITY: 35,
  LOW_VOLATILITY: 55,
  UNCERTAIN: 50,
};

/** P10 regime encoded deterministically; unusual states become soft gates. */
export function scoreRegime(regime: MarketRegime | undefined): ComponentScore {
  const value = regime ?? 'UNCERTAIN';
  const score = REGIME_SCORES[value];
  const unusual = value === 'UNCERTAIN' || value === 'HIGH_VOLATILITY';
  const direction =
    value === 'STRONG_UPTREND' || value === 'WEAK_UPTREND'
      ? 'LONG'
      : value === 'STRONG_DOWNTREND' || value === 'WEAK_DOWNTREND'
        ? 'SHORT'
        : 'NEUTRAL';
  const item = evidence('regime', `Market regime is ${value}`, value);
  return component(
    score,
    !unusual && score >= 60 ? [item] : [],
    unusual || score < 50 ? [item] : [],
    unusual ? ['UNUSUAL_MARKET_REGIME'] : [],
    direction,
  );
}
