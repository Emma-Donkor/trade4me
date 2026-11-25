import { describe, expect, it } from '@jest/globals';
import {
  assistantRequestSchema,
  backtestConfigSchema,
  candleRangeQuerySchema,
  createWatchlistSchema,
  dateTimeSchema,
  forgotPasswordSchema,
  indicatorsQuerySchema,
  loginSchema,
  modifyPositionSchema,
  moneySchema,
  newsFeedQuerySchema,
  openApiErrorResponse,
  paginationSchema,
  paperOrderSchema,
  quoteQuerySchema,
  registerSchema,
  resetPasswordSchema,
  riskCalculateSchema,
  riskEvaluateRequestSchema,
  riskEvaluateSchema,
  riskProfileSchema,
  riskRuleCodeSchema,
  RISK_HARD_CAPS,
  updateRiskProfileSchema,
  scannerQuerySchema,
  watchlistItemSchema,
  watchlistReorderSchema,
  zodToOpenApi,
  type z,
} from './index';

interface Case {
  name: string;
  value: unknown;
  valid: boolean;
}

function check(schema: z.ZodType, cases: Case[]): void {
  it.each(cases)('$name', ({ value, valid }) => {
    expect(schema.safeParse(value).success).toBe(valid);
  });
}

describe('P05 validation schemas (table-driven)', () => {
  describe('common', () => {
    check(dateTimeSchema, [
      { name: 'accepts ISO timestamps', value: '2026-11-21T08:00:00.000Z', valid: true },
      { name: 'rejects arbitrary strings', value: 'not-a-date', valid: false },
      { name: 'rejects empty strings', value: '', valid: false },
    ]);

    check(moneySchema, [
      { name: 'accepts 8 decimal places', value: 1.12345678, valid: true },
      { name: 'rejects 9 decimal places', value: 1.123456789, valid: false },
      { name: 'rejects NaN', value: Number.NaN, valid: false },
      { name: 'rejects strings', value: '1.10', valid: false },
    ]);

    check(paginationSchema, [
      { name: 'accepts coerced query strings', value: { page: '2', pageSize: '25' }, valid: true },
      { name: 'accepts cursor style', value: { limit: 10, cursor: 'next-1' }, valid: true },
      { name: 'rejects oversized page', value: { pageSize: 1000 }, valid: false },
      { name: 'rejects unknown keys', value: { page: 1, offset: 20 }, valid: false },
    ]);
  });

  describe('auth', () => {
    check(registerSchema, [
      {
        name: 'accepts a valid registration',
        value: { email: 'user@example.com', password: 'correct-horse' },
        valid: true,
      },
      {
        name: 'rejects short passwords',
        value: { email: 'user@example.com', password: 'short' },
        valid: false,
      },
      {
        name: 'rejects malformed email',
        value: { email: 'nope', password: 'correct-horse' },
        valid: false,
      },
      {
        name: 'rejects unknown keys',
        value: { email: 'user@example.com', password: 'correct-horse', role: 'ADMIN' },
        valid: false,
      },
    ]);

    check(loginSchema, [
      {
        name: 'accepts credentials',
        value: { email: 'user@example.com', password: 'pw' },
        valid: true,
      },
      {
        name: 'rejects unknown keys',
        value: { email: 'user@example.com', password: 'pw', mfa: true },
        valid: false,
      },
    ]);

    check(forgotPasswordSchema, [
      { name: 'accepts email', value: { email: 'user@example.com' }, valid: true },
      { name: 'rejects bad email', value: { email: 'user' }, valid: false },
    ]);

    check(resetPasswordSchema, [
      {
        name: 'accepts token and password',
        value: { token: 't', password: 'new-password' },
        valid: true,
      },
      { name: 'rejects short password', value: { token: 't', password: 'short' }, valid: false },
    ]);
  });

  describe('market', () => {
    const range = {
      symbol: 'EUR/USD',
      timeframe: 'H1',
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-21T00:00:00.000Z',
    };

    check(candleRangeQuerySchema, [
      { name: 'accepts a bounded range', value: range, valid: true },
      {
        name: 'rejects reversed ranges',
        value: { ...range, from: range.to, to: range.from },
        valid: false,
      },
      { name: 'rejects unsupported timeframe', value: { ...range, timeframe: 'M2' }, valid: false },
      { name: 'rejects unknown keys', value: { ...range, select: '*' }, valid: false },
      {
        name: 'accepts README query aliases',
        value: {
          symbol: 'EUR/USD',
          timeframe: 'H1',
          start: '2026-11-01T00:00:00.000Z',
          end: '2026-11-21T00:00:00.000Z',
          limit: 50,
        },
        valid: true,
      },
      {
        name: 'rejects a range without dates',
        value: { symbol: 'EUR/USD', timeframe: 'H1' },
        valid: false,
      },
    ]);

    check(quoteQuerySchema, [
      { name: 'accepts a symbol', value: { symbol: 'EURUSD' }, valid: true },
      { name: 'accepts documented symbols', value: { symbols: 'EUR/USD,GBP/USD' }, valid: true },
      { name: 'accepts repeated symbols', value: { symbols: ['EUR/USD', 'GBP/USD'] }, valid: true },
      { name: 'rejects unknown keys', value: { symbol: 'EURUSD', fields: [] }, valid: false },
    ]);

    check(scannerQuerySchema, [
      { name: 'accepts score sort', value: { sortBy: 'score', order: 'desc' }, valid: true },
      { name: 'accepts volatility sort', value: { sortBy: 'volatility' }, valid: true },
      { name: 'rejects unknown sort key', value: { sortBy: 'sharpe' }, valid: false },
    ]);

    check(newsFeedQuerySchema, [
      {
        name: 'accepts filters',
        value: { currency: 'usd', sentiment: 'BULLISH', impact: 'HIGH' },
        valid: true,
      },
      { name: 'rejects unknown sentiment', value: { sentiment: 'HAPPY' }, valid: false },
    ]);

    check(indicatorsQuerySchema, [
      {
        name: 'accepts indicator names',
        value: { symbol: 'EUR/USD', timeframe: 'H1', indicators: ['RSI'] },
        valid: true,
      },
      {
        name: 'rejects empty indicator name',
        value: { symbol: 'EUR/USD', timeframe: 'H1', indicators: [''] },
        valid: false,
      },
    ]);
  });

  describe('backtest', () => {
    const config = {
      symbol: 'EUR/USD',
      strategy: 'trend',
      timeframe: 'H1',
      rangeStart: '2025-01-01T00:00:00.000Z',
      rangeEnd: '2025-12-31T00:00:00.000Z',
      startingCapital: 10_000,
      riskPerTradePct: 1,
    };

    check(backtestConfigSchema, [
      { name: 'accepts a full config', value: config, valid: true },
      {
        name: 'rejects an inverted range',
        value: { ...config, rangeEnd: config.rangeStart },
        valid: false,
      },
      { name: 'rejects zero capital', value: { ...config, startingCapital: 0 }, valid: false },
      { name: 'rejects risk over 100%', value: { ...config, riskPerTradePct: 101 }, valid: false },
      { name: 'rejects unknown keys', value: { ...config, lookahead: true }, valid: false },
    ]);
  });

  describe('paper orders', () => {
    const long = {
      symbol: 'EUR/USD',
      side: 'LONG',
      entry: 1.1,
      stopLoss: 1.09,
      takeProfit: 1.12,
      size: 1000,
    };

    check(paperOrderSchema, [
      { name: 'accepts a valid long', value: long, valid: true },
      {
        name: 'accepts a valid short',
        value: { ...long, side: 'SHORT', stopLoss: 1.11, takeProfit: 1.08 },
        valid: true,
      },
      {
        name: 'rejects SL on the wrong side',
        value: { ...long, stopLoss: 1.11 },
        valid: false,
      },
      {
        name: 'rejects negative size',
        value: { ...long, size: -100 },
        valid: false,
      },
      {
        name: 'rejects zero risk/reward',
        value: { ...long, takeProfit: 1.1 },
        valid: false,
      },
      { name: 'rejects unknown keys', value: { ...long, broker: 'real' }, valid: false },
    ]);

    check(modifyPositionSchema, [
      { name: 'accepts SL update', value: { stopLoss: 1.095 }, valid: true },
      { name: 'rejects empty update', value: {}, valid: false },
    ]);
  });

  describe('risk', () => {
    check(riskCalculateSchema, [
      {
        name: 'accepts a hypothetical order',
        value: {
          symbol: 'EUR/USD',
          balance: 10_000,
          riskPerTradePct: 1,
          entry: 1.1,
          stopLoss: 1.09,
          takeProfit: 1.12,
        },
        valid: true,
      },
      {
        name: 'rejects wrong-side stop',
        value: {
          symbol: 'EUR/USD',
          balance: 10_000,
          riskPerTradePct: 1,
          entry: 1.1,
          stopLoss: 1.11,
          takeProfit: 1.12,
        },
        valid: false,
      },
    ]);

    check(riskEvaluateSchema, [
      {
        name: 'accepts an order with profile override',
        value: {
          order: {
            symbol: 'EUR/USD',
            side: 'LONG',
            entry: 1.1,
            stopLoss: 1.09,
            takeProfit: 1.12,
            size: 1000,
          },
          profile: {
            riskPerTradePct: 1,
            maxOpenPositions: 5,
            maxDailyLossPct: 3,
            minRiskReward: 1.5,
          },
        },
        valid: true,
      },
      {
        name: 'rejects unknown keys',
        value: {
          order: {
            symbol: 'EUR/USD',
            side: 'LONG',
            entry: 1.1,
            stopLoss: 1.09,
            takeProfit: 1.12,
            size: 1000,
          },
          realMoney: true,
        },
        valid: false,
      },
    ]);

    check(riskProfileSchema, [
      {
        name: 'accepts Conservative template',
        value: {
          name: 'Conservative',
          riskPerTradePct: 0.5,
          maxOpenPositions: 3,
          maxDailyLossPct: 1.5,
          minRiskReward: 2,
        },
        valid: true,
      },
      {
        name: 'rejects unknown template',
        value: {
          name: 'Reckless',
          riskPerTradePct: 1,
          maxOpenPositions: 5,
          maxDailyLossPct: 3,
          minRiskReward: 1,
        },
        valid: false,
      },
      {
        name: 'rejects a profile above the hard caps',
        value: {
          name: 'Aggressive',
          riskPerTradePct: 5,
          maxOpenPositions: 20,
          maxDailyLossPct: 10,
          minRiskReward: 0.5,
        },
        valid: false,
      },
    ]);

    const order = {
      symbol: 'EUR/USD',
      side: 'LONG',
      entry: 1.1,
      stopLoss: 1.095,
      takeProfit: 1.11,
      size: 0.2,
    };
    check(riskEvaluateRequestSchema, [
      {
        name: 'accepts live context alongside the documented order/profile shape',
        value: {
          order,
          profile: {
            riskPerTradePct: 1,
            maxOpenPositions: 5,
            maxDailyLossPct: 3,
            minRiskReward: 1.5,
          },
          context: {
            balance: 10_000,
            confidence: 0.9,
            dataFreshnessSeconds: 2,
            missingFeatures: [],
            imminentEvents: [{ eventName: 'NFP', currency: 'USD', minutesUntil: 15 }],
          },
        },
        valid: true,
      },
      {
        name: 'rejects confidence above 1',
        value: { order, context: { confidence: 1.5 } },
        valid: false,
      },
      {
        name: 'rejects unknown context keys',
        value: { order, context: { trustMe: true } },
        valid: false,
      },
    ]);

    check(riskRuleCodeSchema, [
      { name: 'accepts all twelve documented rules', value: 'MIN_RISK_REWARD', valid: true },
      { name: 'rejects invented rules', value: 'GUT_FEELING', valid: false },
    ]);

    check(updateRiskProfileSchema, [
      { name: 'accepts an in-cap override', value: { riskPerTradePct: 1 }, valid: true },
      { name: 'rejects risk above the hard cap', value: { riskPerTradePct: 3 }, valid: false },
      {
        name: 'rejects positions above the hard cap',
        value: { maxOpenPositions: 50 },
        valid: false,
      },
      {
        name: 'rejects daily loss above the hard cap',
        value: { maxDailyLossPct: 9 },
        valid: false,
      },
    ]);

    it('mirrors the config hard caps exactly', () => {
      expect(RISK_HARD_CAPS).toEqual({
        riskPerTradePct: 2,
        maxOpenPositions: 8,
        maxDailyLossPct: 5,
        minRiskReward: 10,
        maxPortfolioExposurePct: 50,
        maxDrawdownPct: 20,
        maxVolatilityPct: 40,
      });
    });
  });

  describe('watchlist and assistant', () => {
    check(createWatchlistSchema, [
      { name: 'accepts a name', value: { name: 'Majors' }, valid: true },
      { name: 'rejects empty name', value: { name: '' }, valid: false },
    ]);

    check(watchlistItemSchema, [
      { name: 'accepts a pair', value: { symbol: 'EUR/USD' }, valid: true },
      {
        name: 'accepts alerts',
        value: { symbol: 'EUR/USD', alerts: { priceAbove: 1.2 } },
        valid: true,
      },
    ]);

    check(watchlistReorderSchema, [
      {
        name: 'accepts explicit order',
        value: {
          items: [
            { id: 'a', sortOrder: 0 },
            { id: 'b', sortOrder: 1 },
          ],
        },
        valid: true,
      },
      { name: 'rejects empty list', value: { items: [] }, valid: false },
      {
        name: 'rejects negative sort order',
        value: { items: [{ id: 'a', sortOrder: -1 }] },
        valid: false,
      },
    ]);

    check(assistantRequestSchema, [
      {
        name: 'accepts a grounded question',
        value: { message: 'Why is EUR/USD risky?', history: [{ role: 'USER', content: 'Hi' }] },
        valid: true,
      },
      { name: 'rejects empty message', value: { message: '' }, valid: false },
      { name: 'rejects unknown keys', value: { message: 'Hi', temperature: 2 }, valid: false },
    ]);
  });

  describe('OpenAPI derivation', () => {
    it('derives Swagger metadata from the same Zod schema', () => {
      const schema = zodToOpenApi(paperOrderSchema, { description: 'A simulated order' });
      expect(schema.description).toBe('A simulated order');
      expect(Object.keys(schema.properties ?? {}).sort()).toEqual(
        ['entry', 'side', 'size', 'stopLoss', 'symbol', 'takeProfit'].sort(),
      );
      expect(schema.additionalProperties).toBe(false);
    });

    it('derives the documented error envelope', () => {
      const response = openApiErrorResponse('Validation failed');
      const schema = response.content['application/json'].schema;
      expect(schema.properties).toHaveProperty('error');
      expect(schema.properties?.error).toHaveProperty('properties.requestId');
      expect(response.description).toBe('Validation failed');
    });
  });
});
