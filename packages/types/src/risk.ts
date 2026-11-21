export type RiskVerdictStatus = 'PASS' | 'WARN' | 'BLOCK';

export interface RiskRuleVerdict {
  rule: string;
  status: RiskVerdictStatus;
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
}

/** README §14.3 profile templates; user overrides stay within hard caps. */
export interface RiskProfile {
  name: 'Conservative' | 'Moderate' | 'Aggressive' | string;
  riskPerTradePct: number;
  maxOpenPositions: number;
  maxDailyLossPct: number;
  minRiskReward: number;
  maxPortfolioExposurePct?: number;
  maxDrawdownPct?: number;
  maxVolatility?: number;
  newsEventRestrictions?: boolean;
}
