import type { NoTradeReason } from './signal';

export type RiskVerdictStatus = 'PASS' | 'WARN' | 'BLOCK';

/** P15 — every rule has one stable, machine-readable identity. */
export type RiskRuleCode =
  | 'MAX_RISK_PER_TRADE'
  | 'MAX_DAILY_LOSS'
  | 'MAX_OPEN_POSITIONS'
  | 'MAX_PORTFOLIO_EXPOSURE'
  | 'MAX_CORRELATED_EXPOSURE'
  | 'MAX_DRAWDOWN'
  | 'MIN_RISK_REWARD'
  | 'MAX_VOLATILITY'
  | 'NEWS_EVENT_RESTRICTION'
  | 'MIN_CONFIDENCE'
  | 'DATA_STALENESS'
  | 'MISSING_FEATURES';

export interface RiskRuleVerdict {
  rule: string;
  status: RiskVerdictStatus;
  /** Canonical alias of `status` (P15 contract). */
  severity?: RiskVerdictStatus;
  /** Machine-readable rule identity (P15 contract). */
  code?: RiskRuleCode;
  /** Human-readable explanation (P15 contract). */
  message?: string;
  /** Legacy alias of `message`. */
  reason?: string;
}

/** README §14.1 outputs plus the structured verdict consumed by NO-TRADE. */
export interface RiskAssessment {
  positionSize: number;
  maxLoss: number;
  riskReward: number;
  potentialProfit: number;
  potentialLoss: number;
  exposure: number;
  drawdown: number;
  status: RiskVerdictStatus;
  verdicts: RiskRuleVerdict[];
  /** P15 extras — optional so the P13/P14 fixture contract stays valid. */
  action?: 'TRADE' | 'NO_TRADE';
  reasonCodes?: RiskRuleCode[];
  noTradeReasons?: NoTradeReason[];
}

/** Sizing preview returned by POST /risk/calculate. */
export interface RiskCalculation {
  symbol: string;
  side: 'LONG' | 'SHORT';
  pipSize: number;
  pointValue: number;
  riskAmount: number;
  stopDistance: number;
  stopPips: number;
  positionSize: number;
  maxLoss: number;
  riskReward: number;
  potentialProfit: number;
  potentialLoss: number;
  exposure: number;
  drawdown: number;
}

/** One effective rule returned by GET /risk/rules. */
export interface RiskRuleDefinition {
  code: RiskRuleCode;
  rule: string;
  defaultSeverity: RiskVerdictStatus;
  message: string;
  threshold: number | boolean | null;
  source: 'config' | 'profile';
}

/** README §14.3 profile templates; user overrides stay within hard caps. */
export interface RiskProfile {
  name: 'Conservative' | 'Moderate' | 'Aggressive' | string;
  profileType?: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  riskPerTradePct: number;
  maxOpenPositions: number;
  maxDailyLossPct: number;
  minRiskReward: number;
  maxPortfolioExposurePct?: number;
  maxDrawdownPct?: number;
  maxVolatility?: number;
  newsEventRestrictions?: boolean;
}
