import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  DecisionWeights as ConfigDecisionWeights,
  Timeframe as ConfigTimeframe,
} from '../../packages/config/src';
import {
  type AIAnalysis,
  type ApiError,
  type ApiResponse,
  type AssistantRequest,
  type BacktestConfig,
  type BacktestResult,
  type Candle,
  type CurrencyPair,
  type DecisionWeights,
  type DriftRequest,
  type DriftResponse,
  type Timeframe,
  type ErrorCode,
  type ExplainRequest,
  type ExplainResponse,
  type FeatureVector,
  type FeaturesRequest,
  type FeaturesResponse,
  type IndicatorsRequest,
  type MarketQuote,
  type NewsArticle,
  type Notification,
  type Paginated,
  type PaperOrder,
  type Position,
  type PortfolioSummary,
  type Prediction,
  type PredictRequest,
  type PredictResponse,
  type RiskAssessment,
  type SignalScoreBand,
  type TradeSignal,
  type TrainRequest,
  type TrainResponse,
  type WatchlistItem,
  type WebSocketEventPayloads,
} from '../../packages/types/src';
import {
  trainRequestSchema,
  trainResponseSchema,
  type z,
  assistantRequestSchema,
  backtestConfigSchema,
  candleRangeQuerySchema,
  driftRequestSchema,
  driftResponseSchema,
  errorCodeSchema,
  explainFactorSchema,
  explainRequestSchema,
  explainResponseSchema,
  featuresRequestSchema,
  featuresResponseSchema,
  indicatorsRequestSchema,
  indicatorsResponseSchema,
  newsFeedQuerySchema,
  paginationSchema,
  paperOrderSchema,
  predictRequestSchema,
  predictResponseSchema,
  riskEvaluateSchema,
  scannerQuerySchema,
  watchlistReorderSchema,
  zodToOpenApi,
} from '../../packages/validation/src';

type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
function expectMutual<T extends true>(assertion: T): T {
  return assertion;
}

describe('PHASE 05 contract parity', () => {
  it('keeps compile-time TS types in sync with their Zod boundary schemas', () => {
    expectMutual<Mutual<z.infer<typeof errorCodeSchema>, ErrorCode>>(true);
    expectMutual<Mutual<z.infer<typeof paperOrderSchema>, PaperOrder>>(true);
    expectMutual<Mutual<z.infer<typeof backtestConfigSchema>, BacktestConfig>>(true);
    expectMutual<Mutual<z.infer<typeof assistantRequestSchema>, AssistantRequest>>(true);
    expectMutual<Mutual<z.infer<typeof indicatorsRequestSchema>, IndicatorsRequest>>(true);
    expectMutual<Mutual<z.infer<typeof featuresRequestSchema>, FeaturesRequest>>(true);
    expectMutual<Mutual<z.infer<typeof predictRequestSchema>, PredictRequest>>(true);
    expectMutual<Mutual<z.infer<typeof predictResponseSchema>, PredictResponse>>(true);
    expectMutual<Mutual<z.infer<typeof driftRequestSchema>, DriftRequest>>(true);
    expectMutual<Mutual<z.infer<typeof driftResponseSchema>, DriftResponse>>(true);
    expectMutual<Mutual<z.infer<typeof explainRequestSchema>, ExplainRequest>>(true);
    expectMutual<Mutual<z.infer<typeof explainResponseSchema>, ExplainResponse>>(true);
    expectMutual<Mutual<z.infer<typeof featuresResponseSchema>, FeaturesResponse>>(true);
    expectMutual<Mutual<z.infer<typeof trainRequestSchema>, TrainRequest>>(true);
    expectMutual<Mutual<z.infer<typeof trainResponseSchema>, TrainResponse>>(true);
    // Existing P02 config declarations must not drift from the shared contracts.
    expectMutual<Mutual<Timeframe, ConfigTimeframe>>(true);
    expectMutual<Mutual<DecisionWeights, ConfigDecisionWeights>>(true);
  });

  it('constructs every documented domain type without ad-hoc shapes', () => {
    const quote = {
      symbol: 'EUR/USD',
      bid: 1.0842,
      ask: 1.0844,
      spread: 0.0002,
      timestamp: '2026-11-21T08:00:00.000Z',
      provider: 'MOCK',
    } satisfies MarketQuote;

    const candle = {
      symbol: 'EUR/USD',
      timeframe: 'H1',
      timestamp: '2026-11-21T08:00:00.000Z',
      open: 1.0842,
      high: 1.0851,
      low: 1.0839,
      close: 1.0847,
      volume: null,
      provider: 'MOCK',
    } satisfies Candle;

    const pair = {
      id: 'pair-1',
      symbol: 'EUR/USD',
      baseCurrency: 'EUR',
      quoteCurrency: 'USD',
      active: true,
      pipSize: 0.0001,
    } satisfies CurrencyPair;

    const features = {
      symbol: 'EUR/USD',
      timeframe: 'H1',
      timestamp: '2026-11-21T08:00:00.000Z',
      featureVersion: 'v2.1',
      features: { rsi: 61.2, atr: 0.0041 },
    } satisfies FeatureVector;

    const prediction = {
      id: 'pred-1',
      symbol: 'EUR/USD',
      timeframe: 'H1',
      direction: 'LONG',
      probability: 0.72,
      confidence: 0.81,
      riskLevel: 'MEDIUM',
      modelVersion: 'xgboost-v1.4.2',
      horizon: 5,
      createdAt: '2026-11-21T08:00:00.000Z',
      featureVersion: 'v2.1',
      outcome: {
        predictionId: 'pred-1',
        resolvedAt: '2026-11-22T08:00:00.000Z',
        actualMovePct: 0.41,
        label: 1,
        correct: true,
      },
    } satisfies Prediction;

    const signal = {
      id: 'sig-1',
      symbol: 'EUR/USD',
      action: 'LONG',
      direction: 'LONG',
      score: 78,
      probability: 0.72,
      confidence: 0.81,
      riskLevel: 'MEDIUM',
      scores: { technical: 0.25, historical: 0.2, ml: 0.25, news: 0.1, regime: 0.1, risk: 0.1 },
      reasons: ['Trend aligned'],
      noTradeReasons: [],
      generatedAt: '2026-11-21T08:00:00.000Z',
      regime: 'WEAK_UPTREND',
    } satisfies TradeSignal;

    const risk = {
      positionSize: 12_500,
      maxLoss: 25,
      riskReward: 2.1,
      potentialProfit: 52.5,
      potentialLoss: 25,
      exposure: 0.12,
      drawdown: 0.03,
      status: 'PASS',
      verdicts: [{ rule: 'MIN_RISK_REWARD', status: 'PASS' }],
    } satisfies RiskAssessment;

    const article = {
      id: 'news-1',
      source: 'MOCK',
      title: 'Headline',
      publishedAt: '2026-11-21T08:00:00.000Z',
      currencies: ['EUR', 'USD'],
      analysis: {
        articleId: 'news-1',
        eventType: 'INFLATION',
        sentiment: 'BULLISH',
        impact: 'HIGH',
        confidence: 0.7,
        affectedPairs: ['EUR/USD'],
        analyzedBy: 'MOCK',
        analyzedAt: '2026-11-21T08:05:00.000Z',
      },
    } satisfies NewsArticle;

    const position = {
      id: 'pos-1',
      symbol: 'EUR/USD',
      side: 'LONG',
      status: 'OPEN',
      entryPrice: 1.0842,
      size: 1000,
      unrealizedPnl: 5,
      openedAt: '2026-11-21T08:00:00.000Z',
    } satisfies Position;

    const portfolio = {
      id: 'pf-1',
      balance: 10_000,
      equity: 10_005,
      unrealizedPnl: 5,
      realizedPnl: 0,
      drawdownPct: 0,
      winRate: 0,
      profitFactor: 0,
      exposurePct: 12,
      positions: [position],
    } satisfies PortfolioSummary;

    const backtestConfig = {
      symbol: 'EUR/USD',
      strategy: 'trend',
      timeframe: 'H1',
      rangeStart: '2025-01-01T00:00:00.000Z',
      rangeEnd: '2025-12-31T00:00:00.000Z',
      startingCapital: 10_000,
      riskPerTradePct: 1,
    } satisfies BacktestConfig;

    const backtestResult = {
      trades: 10,
      wins: 6,
      losses: 4,
      netReturnPct: 4.2,
      profitFactor: 1.4,
      maxDrawdownPct: 2.1,
      sharpe: 1.2,
      equityCurve: [{ timestamp: '2025-12-31T00:00:00.000Z', equity: 10_420 }],
    } satisfies BacktestResult;

    const weights = {
      technical: 0.25,
      historical: 0.2,
      ml: 0.25,
      news: 0.1,
      regime: 0.1,
      risk: 0.1,
    } satisfies DecisionWeights;

    const band = { min: 80, max: 100, label: 'Strong setup' } satisfies SignalScoreBand;
    const watchlistItem = { id: 'wi-1', symbol: 'EUR/USD', sortOrder: 0 } satisfies WatchlistItem;

    const notification = {
      id: 'n-1',
      type: 'SIGNAL_CHANGED',
      title: 'Signal',
      body: 'Score changed',
      payload: { from: 70, to: 78 },
      read: false,
      createdAt: '2026-11-21T08:00:00.000Z',
    } satisfies Notification;

    const analysis = {
      id: 'ai-1',
      subjectType: 'SIGNAL',
      subjectId: 'sig-1',
      summary: 'Momentum agrees',
      supportingEvidence: { rsi: 61.2 },
      contradictingEvidence: {},
      explanationText: 'Trend confirmed.',
      llmModel: 'mock',
      payloadHash: 'sha256:abc',
      freshnessSeconds: 12,
      timestamp: '2026-11-21T08:05:00.000Z',
    } satisfies AIAnalysis;

    const page = {
      items: [quote],
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    } satisfies Paginated<MarketQuote>;

    const success = {
      success: true,
      data: quote,
      requestId: 'req-1',
    } satisfies ApiResponse<MarketQuote>;
    const error = {
      success: false,
      error: { code: 'MARKET_DATA_STALE', message: 'Stale', requestId: 'req-2' },
    } satisfies ApiError;

    const wsPayloads: WebSocketEventPayloads = {
      'quote:update': {
        symbol: quote.symbol,
        bid: quote.bid,
        ask: quote.ask,
        timestamp: quote.timestamp,
      },
      'signal:new': {
        signalId: signal.id,
        symbol: signal.symbol,
        action: signal.action,
        score: signal.score,
      },
      'signal:changed': { signalId: signal.id, changes: { score: 79 } },
      'analysis:updated': { symbol: pair.symbol, assessment: { score: signal.score } },
      'notification:new': { notification },
      'position:update': { positionId: position.id, status: position.status, unrealizedPnl: 5 },
      'regime:changed': { symbol: pair.symbol, regime: 'WEAK_UPTREND' },
    };

    expect([
      candle,
      features,
      prediction,
      risk,
      article,
      portfolio,
      backtestConfig,
      backtestResult,
      weights,
      band,
      watchlistItem,
      analysis,
      page,
      success,
      error,
      wsPayloads,
    ]).toHaveLength(16);
  });

  it('validates shared fixtures with both Zod and field-name parity', () => {
    const fixtures = JSON.parse(
      readFileSync(resolve(__dirname, 'fixtures', 'ai-routes.json'), 'utf8'),
    ) as Record<string, { fields: string[]; payload: Record<string, unknown> }>;

    const schemas: Record<string, z.ZodType> = {
      IndicatorsRequest: indicatorsRequestSchema,
      IndicatorsResponse: indicatorsResponseSchema,
      FeaturesRequest: featuresRequestSchema,
      FeaturesResponse: featuresResponseSchema,
      TrainRequest: trainRequestSchema,
      TrainResponse: trainResponseSchema,
      PredictRequest: predictRequestSchema,
      PredictResponse: predictResponseSchema,
      DriftRequest: driftRequestSchema,
      DriftResponse: driftResponseSchema,
      ExplainRequest: explainRequestSchema,
      ExplainFactor: explainFactorSchema,
      ExplainResponse: explainResponseSchema,
    };

    for (const [name, fixture] of Object.entries(fixtures)) {
      const schema = schemas[name];
      expect({ name, defined: schema !== undefined }).toEqual({ name, defined: true });
      if (!schema) continue;

      const result = schema.safeParse(fixture.payload);
      expect({ name, valid: result.success }).toEqual({ name, valid: true });

      const properties = Object.keys(zodToOpenApi(schema).properties ?? {}).sort();
      expect({ name, properties }).toEqual({ name, properties: [...fixture.fields].sort() });
      expect({ name, fixtureFields: Object.keys(fixture.payload).sort() }).toEqual({
        name,
        fixtureFields: [...fixture.fields].sort(),
      });
    }
  });

  it('exposes runtime schemas for every boundary input crossing into the API', () => {
    const pairs: Array<{
      name: string;
      schema: z.ZodType;
      fixture: Record<string, unknown>;
    }> = [
      {
        name: 'PaginationQuery',
        schema: paginationSchema,
        fixture: { page: 2, pageSize: 25, limit: 25, cursor: 'next-1' },
      },
      {
        name: 'CandleRangeQuery',
        schema: candleRangeQuerySchema,
        fixture: {
          symbol: 'EUR/USD',
          timeframe: 'H1',
          from: '2026-11-01T00:00:00.000Z',
          to: '2026-11-21T00:00:00.000Z',
          start: '2026-11-01T00:00:00.000Z',
          end: '2026-11-21T00:00:00.000Z',
          limit: 50,
          page: 1,
          pageSize: 50,
          order: 'desc',
          cursor: 'Y3Vyc29yOjI=',
        },
      },
      {
        name: 'ScannerQuery',
        schema: scannerQuerySchema,
        fixture: { sortBy: 'score', order: 'desc', action: 'LONG' },
      },
      {
        name: 'NewsFeedQuery',
        schema: newsFeedQuerySchema,
        fixture: {
          currency: 'USD',
          sentiment: 'BULLISH',
          impact: 'HIGH',
          page: 1,
          pageSize: 20,
        },
      },
      {
        name: 'PaperOrder',
        schema: paperOrderSchema,
        fixture: {
          symbol: 'EUR/USD',
          side: 'LONG',
          entry: 1.0842,
          stopLoss: 1.08,
          takeProfit: 1.093,
          size: 1000,
        },
      },
      {
        name: 'BacktestConfig',
        schema: backtestConfigSchema,
        fixture: {
          symbol: 'EUR/USD',
          strategy: 'trend',
          timeframe: 'H1',
          rangeStart: '2025-01-01T00:00:00.000Z',
          rangeEnd: '2025-12-31T00:00:00.000Z',
          startingCapital: 10_000,
          riskPerTradePct: 1,
          spreadPips: 0.2,
          slippagePips: 0.1,
        },
      },
      {
        name: 'RiskEvaluate',
        schema: riskEvaluateSchema,
        fixture: {
          order: {
            symbol: 'EUR/USD',
            side: 'LONG',
            entry: 1.0842,
            stopLoss: 1.08,
            takeProfit: 1.093,
            size: 1000,
          },
          profile: {
            riskPerTradePct: 1,
            maxOpenPositions: 5,
            maxDailyLossPct: 3,
            minRiskReward: 1.5,
          },
        },
      },
      {
        name: 'WatchlistReorder',
        schema: watchlistReorderSchema,
        fixture: {
          items: [
            { id: 'wi-1', sortOrder: 0 },
            { id: 'wi-2', sortOrder: 1 },
          ],
        },
      },
      {
        name: 'AssistantRequest',
        schema: assistantRequestSchema,
        fixture: { message: 'Why is EUR/USD risky?', history: [{ role: 'USER', content: 'Hi' }] },
      },
    ];

    for (const pair of pairs) {
      expect({ name: pair.name, valid: pair.schema.safeParse(pair.fixture).success }).toEqual({
        name: pair.name,
        valid: true,
      });
      expect({
        name: pair.name,
        properties: Object.keys(zodToOpenApi(pair.schema).properties ?? {}).sort(),
      }).toEqual({ name: pair.name, properties: Object.keys(pair.fixture).sort() });
    }
  });
});
