import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_DECISION_WEIGHTS,
  DECISION_WEIGHTS_VERSION,
  FEATURE_NAMES,
  RISK_HARD_CAPS,
} from '@ts/config';
import type { DecisionEvidenceBundle, NoTradeReason } from '@ts/types';
import { bandForScore } from './bands';
import { decide } from './decision.engine';
import { assembleEvidence } from './evidence';
import { evaluateNoTrade, type NoTradeInput } from './no-trade';
import { compareWeights, resolveWeights, snapshotScores } from './scoring';
import { DecisionWeightsService } from './scoring/weights.service';

const fullFeatures = () =>
  Object.fromEntries(FEATURE_NAMES.map((name) => [name, name === 'atr_pct' ? 1 : 0]));

function cleanRisk() {
  return {
    positionSize: 0.1,
    maxLoss: 10,
    riskReward: 2,
    potentialProfit: 20,
    potentialLoss: 10,
    exposure: 2,
    drawdown: 1,
    status: 'PASS' as const,
    verdicts: [{ rule: 'MIN_RISK_REWARD', status: 'PASS' as const }],
    action: 'TRADE' as const,
    noTradeReasons: [],
  };
}

function technical(regime: 'STRONG_UPTREND' | 'STRONG_DOWNTREND' | 'RANGE' = 'STRONG_UPTREND') {
  const direction = regime === 'STRONG_UPTREND' ? 90 : regime === 'STRONG_DOWNTREND' ? 20 : 50;
  return {
    symbol: 'EUR/USD',
    timeframe: 'H1' as const,
    asOf: '2026-01-15T12:00:00.000Z',
    source: 'ai' as const,
    indicators: {},
    patterns: [],
    regime: { regime, confidence: 0.8, evidence: {} },
    score: {
      score: direction,
      subScores: { trend: direction, momentum: direction },
      weights: { trend: 0.5, momentum: 0.5 },
      regime,
      evidenceCount: 10,
    },
  };
}

function historical(changePct = 1) {
  return {
    symbol: 'EUR/USD',
    timeframe: 'H1' as const,
    asOf: '2026-01-15T12:00:00.000Z',
    periods: [],
    volatility: {
      timeframe: 'H1' as const,
      annualizedPct: 8,
      periodPct: 1,
      sampleSize: 100,
      asOf: '2026-01-15T12:00:00.000Z',
    },
    similarConditions: [
      { timestamp: '2026-01-14T12:00:00.000Z', distance: 0.1, close: 1.1, changePct },
      { timestamp: '2026-01-13T12:00:00.000Z', distance: 0.2, close: 1.1, changePct },
      { timestamp: '2026-01-12T12:00:00.000Z', distance: 0.3, close: 1.1, changePct },
    ],
    similarityMethod: 'feature-euclidean-v1.0' as const,
    dataPoints: 120,
  };
}

function prediction(direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'LONG', confidence = 0.85) {
  return {
    symbol: 'EUR/USD',
    timeframe: 'H1' as const,
    direction,
    probability: direction === 'LONG' ? 0.82 : direction === 'SHORT' ? 0.2 : 0.5,
    confidence,
    riskLevel: 'LOW' as const,
    modelVersion: 'p14-test-1.0.0',
  };
}

function bundle(): DecisionEvidenceBundle {
  return {
    symbol: 'EUR/USD',
    asOf: '2026-01-15T12:00:00.000Z',
    timeframe: 'H1',
    weights: { ...DEFAULT_DECISION_WEIGHTS },
    weightsVersion: DECISION_WEIGHTS_VERSION,
    technical: technical(),
    historical: historical(),
    prediction: prediction(),
    news: {
      symbol: 'EUR/USD',
      score: 0.8,
      sentiment: 'BULLISH',
      articleCount: 3,
      computedAt: '2026-01-15T12:00:00.000Z',
    },
    risk: cleanRisk(),
    featureVector: {
      symbol: 'EUR/USD',
      timeframe: 'H1',
      timestamp: '2026-01-15T12:00:00.000Z',
      featureVersion: 'v1.0',
      features: fullFeatures(),
    },
    dataFreshnessSeconds: 30,
  };
}

describe('P16 decision engine', () => {
  it('combines the six weighted components into a banded, evidence-backed action', () => {
    const result = decide(bundle());

    // 90*.25 + 75*.20 + 82*.25 + 90*.10 + 90*.10 + 90*.10
    expect(result.score).toBe(85);
    expect(result.componentScores).toEqual({
      technical: 90,
      historical: 75,
      ml: 82,
      news: 90,
      regime: 90,
      risk: 90,
    });
    expect(result.band).toBe('Strong setup');
    expect(result.action).toBe('LONG');
    expect(result.direction).toBe('LONG');
    expect(result.noTradeReasons).toEqual([]);
    expect(result.scores.weightsVersion).toBe(DECISION_WEIGHTS_VERSION);
    expect(result.scores.components).toEqual(result.componentScores);
    expect(result.supportingEvidence.length).toBeGreaterThan(0);
    expect(result.probability).toBe(0.82);
    expect(result.modelVersion).toBe('p14-test-1.0.0');
  });

  it('is deterministic for an identical evidence bundle', () => {
    expect(decide(bundle())).toEqual(decide(bundle()));
  });

  it('never lets a high score bypass a NO-TRADE gate', () => {
    const input = bundle();
    input.prediction = prediction('LONG', 0.4);
    const result = decide(input);

    expect(result.action).toBe('NO_TRADE');
    expect(result.noTradeReasons).toContain('LOW_MODEL_CONFIDENCE');
    expect(result.reasons.some((reason) => reason.startsWith('NO_TRADE:'))).toBe(true);
    expect(result.contradictingEvidence.some((item) => item.source === 'no-trade')).toBe(true);
  });

  it('returns WATCH when no gate fires but no direction reaches the action threshold', () => {
    const input = bundle();
    input.technical = technical('RANGE');
    input.historical = historical(0);
    input.prediction = prediction('NEUTRAL');
    input.news = {
      symbol: 'EUR/USD',
      score: 0,
      sentiment: 'NEUTRAL',
      articleCount: 1,
      computedAt: '2026-01-15T12:00:00.000Z',
    };

    const result = decide(input);
    expect(result.action).toBe('WATCH');
    expect(result.direction).toBe('NEUTRAL');
    expect(result.score).toBeLessThan(70);
    expect(result.noTradeReasons).toEqual([]);
  });

  it('penalises conflicting evidence and records it as contradicting evidence', () => {
    const input = bundle();
    input.technical = technical('STRONG_DOWNTREND');

    const result = decide(input);
    expect(result.noTradeReasons).toContain('CONFLICTING_INDICATORS');
    expect(
      result.contradictingEvidence.some((item) => item.claim.includes('Conflict penalty')),
    ).toBe(true);
  });
});

describe('README §15.3 NO-TRADE matrix', () => {
  function noTradeInput(): NoTradeInput {
    return {
      risk: cleanRisk(),
      prediction: prediction(),
      featureVector: {
        symbol: 'EUR/USD',
        timeframe: 'H1',
        timestamp: '2026-01-15T12:00:00.000Z',
        featureVersion: 'v1.0',
        features: fullFeatures(),
      },
      historical: historical(),
      technicalPresent: true,
      newsPresent: true,
      dataFreshnessSeconds: 30,
      volatilityPct: 1,
      regime: 'STRONG_UPTREND',
      imminentEvents: [],
    };
  }

  it('produces no reasons for a complete, clean evidence bundle', () => {
    expect(evaluateNoTrade(noTradeInput()).reasons).toEqual([]);
  });

  const cases: Array<[NoTradeReason, (input: NoTradeInput) => void]> = [
    ['LOW_MODEL_CONFIDENCE', (input) => (input.prediction = prediction('LONG', 0.4))],
    ['CONFLICTING_INDICATORS', (input) => (input.conflictingIndicators = true)],
    [
      'POOR_RISK_REWARD',
      (input) => {
        input.risk = { ...cleanRisk(), riskReward: 1.2 };
      },
    ],
    [
      'EXTREME_VOLATILITY',
      (input) => {
        input.volatilityPct = RISK_HARD_CAPS.maxVolatilityPct + 1;
      },
    ],
    [
      'STALE_MARKET_DATA',
      (input) => {
        input.dataFreshnessSeconds = 9999;
      },
    ],
    ['INSUFFICIENT_HISTORICAL_EVIDENCE', (input) => (input.historical = null)],
    [
      'HIGH_IMPACT_EVENT',
      (input) => {
        input.imminentEvents = [
          { eventName: 'Nonfarm Payrolls', currency: 'USD', minutesUntil: 5 },
        ];
      },
    ],
    ['INSUFFICIENT_DATA', (input) => (input.prediction = null)],
    ['MODEL_DISAGREEMENT', (input) => (input.modelDisagreement = true)],
    ['UNUSUAL_MARKET_REGIME', (input) => (input.regime = 'UNCERTAIN')],
  ];

  it.each(cases)('emits %s as a machine-readable reason', (reason, patch) => {
    const input = noTradeInput();
    patch(input);
    const verdict = evaluateNoTrade(input);
    expect(verdict.reasons).toContain(reason);
    expect(verdict.evidence.some((item) => item.source === 'no-trade')).toBe(true);
  });

  it('preserves a stable reason order independent of insertion order', () => {
    const input = noTradeInput();
    input.prediction = null;
    input.regime = 'HIGH_VOLATILITY';
    input.historical = null;
    expect(evaluateNoTrade(input).reasons).toEqual([
      'INSUFFICIENT_HISTORICAL_EVIDENCE',
      'INSUFFICIENT_DATA',
      'UNUSUAL_MARKET_REGIME',
    ]);
  });

  it('maps P15 hard-gate reasons into the P16 result unchanged', () => {
    const input = noTradeInput();
    input.risk = {
      ...cleanRisk(),
      status: 'BLOCK',
      action: 'NO_TRADE',
      noTradeReasons: ['POOR_RISK_REWARD', 'EXTREME_VOLATILITY'],
    };
    expect(evaluateNoTrade(input).reasons).toEqual(
      expect.arrayContaining(['POOR_RISK_REWARD', 'EXTREME_VOLATILITY']),
    );
  });
});

describe('README §15.2 score bands', () => {
  it.each([
    [100, 'Strong setup'],
    [80, 'Strong setup'],
    [79.99, 'Good setup'],
    [70, 'Good setup'],
    [69.99, 'Watch'],
    [60, 'Watch'],
    [59.99, 'Weak'],
    [50, 'Weak'],
    [49.99, 'Avoid'],
    [0, 'Avoid'],
  ])('maps %s to %s', (score, label) => {
    expect(bandForScore(score)).toBe(label);
  });
});

describe('configurable weight snapshot hooks (P24/P28)', () => {
  it('resolves, validates and versions a complete weight set', () => {
    const resolved = resolveWeights(undefined);
    expect(resolved.weights).toEqual(DEFAULT_DECISION_WEIGHTS);
    expect(resolved.version).toBe(DECISION_WEIGHTS_VERSION);
    expect(() => resolveWeights({ ml: 0.5 })).toThrow();
  });

  it('compares experiments through an in-process provider', () => {
    const service = new DecisionWeightsService();
    expect(service.current().weights).toEqual(DEFAULT_DECISION_WEIGHTS);
    service.configure({ ml: 0.2, technical: 0.3 }, 'p24-experiment');
    expect(service.current()).toEqual({
      weights: { ...DEFAULT_DECISION_WEIGHTS, ml: 0.2, technical: 0.3 },
      version: 'p24-experiment',
    });
    expect(service.compare(DEFAULT_DECISION_WEIGHTS)).toEqual({ ml: -0.05, technical: 0.05 });
  });

  it('snapshots weights and component evidence into the persisted scores JSON', () => {
    const snapshot = snapshotScores({
      weights: DEFAULT_DECISION_WEIGHTS,
      version: 'v1.0',
      components: {
        technical: 80,
        historical: 70,
        ml: 90,
        news: 60,
        regime: 50,
        risk: 90,
      },
      band: 'Strong setup',
    });
    expect(snapshot).toMatchObject({
      ...DEFAULT_DECISION_WEIGHTS,
      weightsVersion: 'v1.0',
      band: 'Strong setup',
    });
    expect(compareWeights(DEFAULT_DECISION_WEIGHTS, DEFAULT_DECISION_WEIGHTS)).toEqual({});
  });
});

describe('evidence honesty', () => {
  it('deduplicates supporting claims and always preserves contradicting claims', () => {
    const assembled = assembleEvidence(
      [
        {
          score: 80,
          supporting: [{ source: 'ml', claim: 'Model is bullish', value: 0.8 }],
          contradicting: [{ source: 'risk', claim: 'Spread is wide', value: 2 }],
          reasons: [],
        },
        {
          score: 60,
          supporting: [{ source: 'ml', claim: 'Model is bullish', value: 0.8 }],
          contradicting: [],
          reasons: [],
        },
      ],
      { supporting: [], contradicting: [{ source: 'news', claim: 'Event risk', value: 'CPI' }] },
    );
    expect(assembled.supporting).toHaveLength(1);
    expect(assembled.contradicting.map((item) => item.source)).toEqual(['news', 'risk']);
  });
});
