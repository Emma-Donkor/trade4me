import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { disconnect } from '@ts/database';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TokenService } from '../src/modules/auth/token.service';
import { RiskService } from '../src/modules/risk/risk.service';
import { createPhase7TestApp, type Phase7TestApp } from './helpers/test-app';

const SYMBOL = 'EUR/USD';
const USER_ID = `p15-user-${randomUUID()}`;

const VALID_ORDER = {
  order: {
    symbol: SYMBOL,
    side: 'LONG' as const,
    entry: 1.1,
    stopLoss: 1.095,
    takeProfit: 1.11,
    size: 0.2,
  },
  context: {
    dataFreshnessSeconds: 2,
    confidence: 0.9,
    missingFeatures: [],
    imminentEvents: [],
    volatilityPct: 10,
  },
};

describe('P15 risk engine', () => {
  let harness: Phase7TestApp;
  let token: string;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://tradesense:tradesense@localhost:5433/tradesense_test';

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    await disconnect();
    harness = await createPhase7TestApp();
    const client = harness.prisma;
    await client.position.deleteMany({ where: { portfolio: { userId: USER_ID } } });
    await client.portfolio.deleteMany({ where: { userId: USER_ID } });
    await client.riskProfile.deleteMany({ where: { userId: USER_ID } });
    await client.user.deleteMany({ where: { id: USER_ID } });
    await client.currencyPair.upsert({
      where: { symbol: SYMBOL },
      create: {
        symbol: SYMBOL,
        baseCurrency: 'EUR',
        quoteCurrency: 'USD',
        pipSize: 0.0001,
        pointValue: 10,
        spreadPipsTypical: 1.2,
        providerSymbols: {},
      },
      update: { isActive: true },
    });
    await client.user.create({
      data: { id: USER_ID, email: `${USER_ID}@p15.test`, passwordHash: 'p15-fixture' },
    });
    await client.riskProfile.create({
      data: {
        userId: USER_ID,
        name: 'Moderate',
        profileType: 'MODERATE',
        riskPerTradePct: 1,
        maxOpenPositions: 5,
        maxDailyLossPct: 3,
        minRiskReward: 1.5,
        maxPortfolioExposurePct: 25,
        maxDrawdownPct: 10,
        maxVolatilityPct: 25,
        newsEventRestriction: true,
      },
    });
    const pair = await client.currencyPair.findUniqueOrThrow({ where: { symbol: SYMBOL } });
    await client.portfolio.create({
      data: {
        userId: USER_ID,
        name: 'p15-main',
        balance: 100_000,
        initialBalance: 100_000,
        positions: {
          create: {
            pairId: pair.id,
            side: 'LONG',
            status: 'OPEN',
            entryPrice: 1.1,
            size: 0.05,
            stopLoss: 1.095,
            takeProfit: 1.11,
            source: 'MANUAL',
          },
        },
      },
    });
    token = (
      await harness.app.get(TokenService).createSession({
        id: USER_ID,
        email: `${USER_ID}@p15.test`,
        roles: ['USER'],
      })
    ).accessToken;
  }, 120_000);

  afterAll(async () => {
    await harness?.prisma.position.deleteMany({ where: { portfolio: { userId: USER_ID } } });
    await harness?.prisma.portfolio.deleteMany({ where: { userId: USER_ID } });
    await harness?.prisma.riskProfile.deleteMany({ where: { userId: USER_ID } });
    await harness?.prisma.user.deleteMany({ where: { id: USER_ID } });
    await harness?.close();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    await disconnect();
  });

  function post(path: string, body: object): request.Test {
    return request(harness.app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  it('calculates real sizing with pair metadata', async () => {
    const response = await post('/risk/calculate', {
      symbol: SYMBOL,
      side: 'LONG',
      balance: 10_000,
      riskPerTradePct: 1,
      entry: 1.1,
      stopLoss: 1.095,
      takeProfit: 1.11,
    }).expect(200);
    expect(response.body.data).toMatchObject({
      symbol: SYMBOL,
      pipSize: 0.0001,
      pointValue: 10,
      riskAmount: 100,
      stopPips: 50,
      positionSize: 0.2,
      maxLoss: 100,
      riskReward: 2,
      potentialProfit: 200,
    });
  });

  it('rejects sizing inputs that are not valid geometry', async () => {
    const response = await post('/risk/calculate', {
      symbol: SYMBOL,
      side: 'LONG',
      balance: 10_000,
      riskPerTradePct: 1,
      entry: 1.1,
      stopLoss: 1.1,
      takeProfit: 1.11,
    }).expect(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns all twelve effective rules with the user profile applied', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/risk/rules')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.data.items).toHaveLength(12);
    expect(response.body.data.items.map((item: { code: string }) => item.code)).toContain(
      'MIN_RISK_REWARD',
    );
    expect(response.body.data.profile).toMatchObject({
      name: 'Moderate',
      riskPerTradePct: 1,
      minRiskReward: 1.5,
      newsEventRestrictions: true,
    });
    expect(response.body.data.thresholds.minConfidence).toBeGreaterThan(0);
  });

  it('blocks a poor R/R order with structured NO_TRADE reasons', async () => {
    const response = await post('/risk/evaluate', {
      ...VALID_ORDER,
      order: { ...VALID_ORDER.order, takeProfit: 1.1074 },
    }).expect(422);
    expect(response.body.error.code).toBe('NO_TRADE_RULE_VIOLATION');
    const details = response.body.error.details;
    expect(details.reasons.join(' ')).toMatch(/Risk\/reward/);
    expect(details.reasonCodes).toContain('MIN_RISK_REWARD');
    expect(details.noTradeReasons).toContain('POOR_RISK_REWARD');
    expect(details.verdicts).toHaveLength(12);
    expect(details.assessment).toMatchObject({ action: 'NO_TRADE', status: 'BLOCK' });
  });

  it('exposes a non-throwing verdict for in-process consumers', async () => {
    const assessment = await harness.moduleRef.get(RiskService).assess(
      {
        ...VALID_ORDER,
        order: { ...VALID_ORDER.order, takeProfit: 1.1074 },
      },
      USER_ID,
    );
    expect(assessment).toMatchObject({
      action: 'NO_TRADE',
      status: 'BLOCK',
      noTradeReasons: expect.arrayContaining(['POOR_RISK_REWARD']),
    });
  });

  it('passes a well-formed order and re-validates client size server-side', async () => {
    const response = await post('/risk/evaluate', VALID_ORDER).expect(200);
    expect(response.body.data).toMatchObject({
      status: 'PASS',
      action: 'TRADE',
      reasonCodes: [],
      riskReward: 2,
      positionSize: 2,
    });
    const oversized = await post('/risk/evaluate', {
      ...VALID_ORDER,
      order: { ...VALID_ORDER.order, size: 50 },
    }).expect(422);
    expect(oversized.body.error.details.reasonCodes).toContain('MAX_RISK_PER_TRADE');
  });

  it('analyzes per-currency exposure from real open positions', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/portfolio/exposure')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const item = response.body.data.items.find(
      (row: { currency: string }) => row.currency === 'EUR',
    );
    expect(item).toBeDefined();
    expect(item.exposurePct).toBeCloseTo(5.5, 2);
    expect(response.body.data.totalExposurePct).toBeGreaterThan(0);
  });

  it('enforces hard caps on profile overrides', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/api/v1/users/me/risk-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ riskPerTradePct: 3 })
      .expect(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const positions = await request(harness.app.getHttpServer())
      .patch('/api/v1/users/me/risk-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ maxOpenPositions: 50 })
      .expect(422);
    expect(positions.body.error.code).toBe('VALIDATION_ERROR');
  });
});
