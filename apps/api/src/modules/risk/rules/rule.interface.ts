import {
  env,
  MAX_CORRELATED_EXPOSURE_PCT,
  MIN_RISK_CONFIDENCE,
  MIN_RISK_CONFIDENCE_WARN,
  NEWS_RISK_WINDOW_MINUTES,
} from '@ts/config';
import type { NoTradeReason, RiskRuleCode, RiskRuleVerdict, RiskVerdictStatus } from '@ts/types';
import type { PairScaling } from '../sizing.service';

export interface EffectiveRiskProfile {
  name: string;
  profileType: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  riskPerTradePct: number;
  maxOpenPositions: number;
  maxDailyLossPct: number;
  minRiskReward: number;
  maxPortfolioExposurePct: number;
  maxDrawdownPct: number;
  maxVolatilityPct: number;
  newsEventRestrictions: boolean;
}

export interface ImminentRiskEvent {
  eventName: string;
  currency: string;
  minutesUntil?: number;
}

/** All live inputs a pure rule is allowed to read. */
export interface RiskRuleContext {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
  balance: number;
  equity: number;
  profile: EffectiveRiskProfile;
  scaling: PairScaling;
  maxAllowedSize: number;
  volatilityPct?: number;
  confidence?: number;
  dataFreshnessSeconds?: number;
  missingFeatures: string[];
  openPositions: number;
  dailyLossPct: number;
  drawdownPct: number;
  portfolioExposurePct: number;
  correlatedExposurePct: number;
  imminentEvents: readonly ImminentRiskEvent[];
}

export const RULE_NAMES: Record<RiskRuleCode, string> = {
  MAX_RISK_PER_TRADE: 'Maximum risk per trade',
  MAX_DAILY_LOSS: 'Maximum daily loss',
  MAX_OPEN_POSITIONS: 'Maximum open positions',
  MAX_PORTFOLIO_EXPOSURE: 'Maximum portfolio exposure',
  MAX_CORRELATED_EXPOSURE: 'Maximum correlated exposure',
  MAX_DRAWDOWN: 'Maximum drawdown',
  MIN_RISK_REWARD: 'Minimum risk/reward',
  MAX_VOLATILITY: 'Maximum volatility',
  NEWS_EVENT_RESTRICTION: 'High-impact news-event restriction',
  MIN_CONFIDENCE: 'Minimum model confidence',
  DATA_STALENESS: 'Market-data freshness',
  MISSING_FEATURES: 'Required feature completeness',
};

/** Rules always speak the same structured language. */
export function verdict(
  code: RiskRuleCode,
  status: RiskVerdictStatus,
  message: string,
): RiskRuleVerdict {
  return { rule: RULE_NAMES[code], code, status, severity: status, message, reason: message };
}

export interface RiskRule {
  code: RiskRuleCode;
  evaluate(context: RiskRuleContext): RiskRuleVerdict;
}

/** Rules with a direct README §15.3 NO-TRADE counterpart. */
export const NO_TRADE_REASON_BY_RULE: Partial<Record<RiskRuleCode, NoTradeReason>> = {
  MIN_RISK_REWARD: 'POOR_RISK_REWARD',
  MAX_VOLATILITY: 'EXTREME_VOLATILITY',
  NEWS_EVENT_RESTRICTION: 'HIGH_IMPACT_EVENT',
  MIN_CONFIDENCE: 'LOW_MODEL_CONFIDENCE',
  DATA_STALENESS: 'STALE_MARKET_DATA',
  MISSING_FEATURES: 'INSUFFICIENT_DATA',
};

export interface RuleChainResult {
  verdicts: RiskRuleVerdict[];
  status: RiskVerdictStatus;
  action: 'TRADE' | 'NO_TRADE';
  reasonCodes: RiskRuleCode[];
  noTradeReasons: NoTradeReason[];
}

/** Any BLOCK wins. WARN is retained as a warning, never silently upgraded. */
export function evaluateRules(
  rules: readonly RiskRule[],
  context: RiskRuleContext,
): RuleChainResult {
  const verdicts = rules.map((rule) => rule.evaluate(context));
  const reasonCodes = verdicts
    .filter((item) => item.status === 'BLOCK' && item.code !== undefined)
    .map((item) => item.code as RiskRuleCode);
  const noTradeReasons = [
    ...new Set(
      reasonCodes
        .map((code) => NO_TRADE_REASON_BY_RULE[code])
        .filter((reason): reason is NoTradeReason => reason !== undefined),
    ),
  ];
  const status: RiskVerdictStatus = verdicts.some((item) => item.status === 'BLOCK')
    ? 'BLOCK'
    : verdicts.some((item) => item.status === 'WARN')
      ? 'WARN'
      : 'PASS';
  return {
    verdicts,
    status,
    action: status === 'BLOCK' ? 'NO_TRADE' : 'TRADE',
    reasonCodes,
    noTradeReasons,
  };
}

/** Shared thresholds advertised by GET /risk/rules. */
export function configuredThresholds() {
  return {
    maxRiskPerTradePct: env.MAX_RISK_PER_TRADE_PCT,
    maxDataFreshnessSeconds: Math.max(1, Number(env.MARKET_DATA_STALE_THRESHOLD_SECONDS ?? 120)),
    minConfidence: MIN_RISK_CONFIDENCE,
    minConfidenceWarn: MIN_RISK_CONFIDENCE_WARN,
    maxCorrelatedExposurePct: MAX_CORRELATED_EXPOSURE_PCT,
    newsWindowMinutes: NEWS_RISK_WINDOW_MINUTES,
    minRiskReward: env.MIN_RISK_REWARD_RATIO,
  };
}
