import type { EffectiveRiskProfile, RiskRuleContext } from '../rules/rule.interface';

export const TEST_PROFILE: EffectiveRiskProfile = {
  name: 'Moderate',
  profileType: 'MODERATE',
  riskPerTradePct: 1,
  maxOpenPositions: 5,
  maxDailyLossPct: 3,
  minRiskReward: 1.5,
  maxPortfolioExposurePct: 25,
  maxDrawdownPct: 10,
  maxVolatilityPct: 25,
  newsEventRestrictions: true,
};

/** A clean PASS context; individual test cases override the relevant field. */
export function testContext(overrides: Partial<RiskRuleContext> = {}): RiskRuleContext {
  return {
    symbol: 'EUR/USD',
    side: 'LONG',
    entry: 1.1,
    stopLoss: 1.095,
    takeProfit: 1.115,
    size: 0.2,
    balance: 10_000,
    equity: 10_000,
    profile: TEST_PROFILE,
    scaling: { pipSize: 0.0001, pointValue: 10 },
    maxAllowedSize: 0.2,
    volatilityPct: 10,
    confidence: 0.9,
    dataFreshnessSeconds: 5,
    missingFeatures: [],
    openPositions: 2,
    dailyLossPct: 0.5,
    drawdownPct: 2,
    portfolioExposurePct: 8,
    correlatedExposurePct: 5,
    imminentEvents: [],
    ...overrides,
  };
}
