import { env } from '@ts/config';
import type { RiskVerdictStatus } from '@ts/types';
import { ALL_RISK_RULES, evaluateRules, type RiskRule, type RiskRuleContext } from '../rules';
import {
  confidenceRule,
  correlationRule,
  dailyLossRule,
  drawdownRule,
  exposureRule,
  missingFeaturesRule,
  newsEventRule,
  openPositionsRule,
  riskPerTradeRule,
  riskRewardRule,
  stalenessRule,
  volatilityRule,
} from '../rules';
import { testContext, TEST_PROFILE } from './context';

interface RuleCase {
  name: string;
  rule: RiskRule;
  override: Partial<RiskRuleContext>;
  expected: RiskVerdictStatus;
}

const freshnessLimit = Math.max(1, Number(env.MARKET_DATA_STALE_THRESHOLD_SECONDS ?? 120));

const cases: RuleCase[] = [
  { name: 'risk per trade PASS', rule: riskPerTradeRule, override: {}, expected: 'PASS' },
  {
    name: 'risk per trade WARN at 90% of budget',
    rule: riskPerTradeRule,
    override: { size: 0.19 },
    expected: 'WARN',
  },
  {
    name: 'risk per trade BLOCK over budget',
    rule: riskPerTradeRule,
    override: { size: 0.3 },
    expected: 'BLOCK',
  },
  {
    name: 'risk per trade BLOCK over hard cap',
    rule: riskPerTradeRule,
    override: { profile: { ...TEST_PROFILE, riskPerTradePct: env.MAX_RISK_PER_TRADE_PCT + 1 } },
    expected: 'BLOCK',
  },
  { name: 'daily loss PASS', rule: dailyLossRule, override: {}, expected: 'PASS' },
  {
    name: 'daily loss WARN',
    rule: dailyLossRule,
    override: { dailyLossPct: 2.5 },
    expected: 'WARN',
  },
  {
    name: 'daily loss BLOCK at limit',
    rule: dailyLossRule,
    override: { dailyLossPct: 3 },
    expected: 'BLOCK',
  },
  { name: 'open positions PASS', rule: openPositionsRule, override: {}, expected: 'PASS' },
  {
    name: 'open positions WARN near limit',
    rule: openPositionsRule,
    override: { openPositions: 4 },
    expected: 'WARN',
  },
  {
    name: 'open positions BLOCK at limit',
    rule: openPositionsRule,
    override: { openPositions: 5 },
    expected: 'BLOCK',
  },
  { name: 'exposure PASS', rule: exposureRule, override: {}, expected: 'PASS' },
  {
    name: 'exposure WARN',
    rule: exposureRule,
    override: { portfolioExposurePct: 21 },
    expected: 'WARN',
  },
  {
    name: 'exposure BLOCK',
    rule: exposureRule,
    override: { portfolioExposurePct: 26 },
    expected: 'BLOCK',
  },
  { name: 'correlation PASS', rule: correlationRule, override: {}, expected: 'PASS' },
  {
    name: 'correlation WARN',
    rule: correlationRule,
    override: { correlatedExposurePct: 13 },
    expected: 'WARN',
  },
  {
    name: 'correlation BLOCK',
    rule: correlationRule,
    override: { correlatedExposurePct: 16 },
    expected: 'BLOCK',
  },
  { name: 'drawdown PASS', rule: drawdownRule, override: {}, expected: 'PASS' },
  {
    name: 'drawdown WARN',
    rule: drawdownRule,
    override: { drawdownPct: 9 },
    expected: 'WARN',
  },
  {
    name: 'drawdown BLOCK',
    rule: drawdownRule,
    override: { drawdownPct: 11 },
    expected: 'BLOCK',
  },
  { name: 'R/R PASS', rule: riskRewardRule, override: {}, expected: 'PASS' },
  {
    name: 'R/W WARN just above minimum',
    rule: riskRewardRule,
    override: { takeProfit: 1.1075 },
    expected: 'WARN',
  },
  {
    name: 'R/R BLOCK below 1.5 minimum',
    rule: riskRewardRule,
    override: { takeProfit: 1.1074 },
    expected: 'BLOCK',
  },
  { name: 'volatility PASS', rule: volatilityRule, override: {}, expected: 'PASS' },
  {
    name: 'volatility WARN',
    rule: volatilityRule,
    override: { volatilityPct: 21 },
    expected: 'WARN',
  },
  {
    name: 'volatility BLOCK',
    rule: volatilityRule,
    override: { volatilityPct: 26 },
    expected: 'BLOCK',
  },
  { name: 'news PASS', rule: newsEventRule, override: {}, expected: 'PASS' },
  {
    name: 'news WARN when restrictions disabled',
    rule: newsEventRule,
    override: {
      profile: { ...TEST_PROFILE, newsEventRestrictions: false },
      imminentEvents: [{ eventName: 'NFP', currency: 'USD', minutesUntil: 20 }],
    },
    expected: 'WARN',
  },
  {
    name: 'news BLOCK when restricted',
    rule: newsEventRule,
    override: {
      imminentEvents: [{ eventName: 'NFP', currency: 'USD', minutesUntil: 20 }],
    },
    expected: 'BLOCK',
  },
  { name: 'confidence PASS', rule: confidenceRule, override: {}, expected: 'PASS' },
  {
    name: 'confidence WARN',
    rule: confidenceRule,
    override: { confidence: 0.7 },
    expected: 'WARN',
  },
  {
    name: 'confidence BLOCK',
    rule: confidenceRule,
    override: { confidence: 0.5 },
    expected: 'BLOCK',
  },
  { name: 'staleness PASS', rule: stalenessRule, override: {}, expected: 'PASS' },
  {
    name: 'staleness WARN',
    rule: stalenessRule,
    override: { dataFreshnessSeconds: Math.ceil(freshnessLimit * 0.8) },
    expected: 'WARN',
  },
  {
    name: 'staleness BLOCK',
    rule: stalenessRule,
    override: { dataFreshnessSeconds: freshnessLimit + 1 },
    expected: 'BLOCK',
  },
  { name: 'features PASS', rule: missingFeaturesRule, override: {}, expected: 'PASS' },
  {
    name: 'features BLOCK',
    rule: missingFeaturesRule,
    override: { missingFeatures: ['rsi14'] },
    expected: 'BLOCK',
  },
];

describe('P15 rules — PASS/WARN/BLOCK fixtures', () => {
  it.each(cases)('$name', ({ rule, override, expected }) => {
    const result = rule.evaluate(testContext(override));
    expect(result.status).toBe(expected);
    expect(result.severity).toBe(expected);
    expect(result.code).toBe(rule.code);
    expect(result.rule.length).toBeGreaterThan(0);
    expect(result.message).toBe(result.reason);
  });

  it('registers exactly the twelve documented rules', () => {
    expect(ALL_RISK_RULES.map((rule) => rule.code)).toEqual([
      'MAX_RISK_PER_TRADE',
      'MAX_DAILY_LOSS',
      'MAX_OPEN_POSITIONS',
      'MAX_PORTFOLIO_EXPOSURE',
      'MAX_CORRELATED_EXPOSURE',
      'MAX_DRAWDOWN',
      'MIN_RISK_REWARD',
      'MAX_VOLATILITY',
      'NEWS_EVENT_RESTRICTION',
      'MIN_CONFIDENCE',
      'DATA_STALENESS',
      'MISSING_FEATURES',
    ]);
  });
});

describe('P15 verdict aggregation', () => {
  it('any BLOCK becomes NO_TRADE with the right reason codes', () => {
    const result = evaluateRules(
      ALL_RISK_RULES,
      testContext({
        takeProfit: 1.1074,
        confidence: 0.4,
        dataFreshnessSeconds: freshnessLimit + 5,
        missingFeatures: ['adx14'],
      }),
    );
    expect(result.status).toBe('BLOCK');
    expect(result.action).toBe('NO_TRADE');
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        'MIN_RISK_REWARD',
        'MIN_CONFIDENCE',
        'DATA_STALENESS',
        'MISSING_FEATURES',
      ]),
    );
    expect(result.noTradeReasons).toEqual(
      expect.arrayContaining([
        'POOR_RISK_REWARD',
        'LOW_MODEL_CONFIDENCE',
        'STALE_MARKET_DATA',
        'INSUFFICIENT_DATA',
      ]),
    );
  });

  it('WARN alone stays tradable but is never reported as PASS', () => {
    const result = evaluateRules(ALL_RISK_RULES, testContext({ confidence: 0.7 }));
    expect(result.status).toBe('WARN');
    expect(result.action).toBe('TRADE');
    expect(result.reasonCodes).toEqual([]);
  });

  it('all clean rules produce PASS and no reasons', () => {
    const result = evaluateRules(ALL_RISK_RULES, testContext());
    expect(result.status).toBe('PASS');
    expect(result.noTradeReasons).toEqual([]);
  });
});
