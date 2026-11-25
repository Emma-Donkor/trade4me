import { correlationRule } from './correlation';
import { confidenceRule } from './confidence';
import { dailyLossRule } from './daily-loss';
import { drawdownRule } from './drawdown';
import { exposureRule } from './exposure';
import { missingFeaturesRule } from './missing-features';
import { newsEventRule } from './news-event';
import { openPositionsRule } from './open-positions';
import { riskPerTradeRule } from './risk-per-trade';
import { riskRewardRule } from './risk-reward';
import { stalenessRule } from './staleness';
import { volatilityRule } from './volatility';

export * from './rule.interface';
export { correlationRule } from './correlation';
export { confidenceRule } from './confidence';
export { dailyLossRule } from './daily-loss';
export { drawdownRule } from './drawdown';
export { exposureRule } from './exposure';
export { missingFeaturesRule } from './missing-features';
export { newsEventRule } from './news-event';
export { openPositionsRule } from './open-positions';
export { riskPerTradeRule } from './risk-per-trade';
export { riskRewardRule } from './risk-reward';
export { stalenessRule } from './staleness';
export { volatilityRule } from './volatility';

/** Registration order is also the order returned by GET /risk/rules. */
export const ALL_RISK_RULES = [
  riskPerTradeRule,
  dailyLossRule,
  openPositionsRule,
  exposureRule,
  correlationRule,
  drawdownRule,
  riskRewardRule,
  volatilityRule,
  newsEventRule,
  confidenceRule,
  stalenessRule,
  missingFeaturesRule,
] as const;
