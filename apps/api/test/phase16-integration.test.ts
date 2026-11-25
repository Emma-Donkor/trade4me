import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { disconnect } from '@ts/database';
import type { Prisma } from '@ts/database';
import { seedHistory } from '../../../scripts/seed-history';
import { AI_ENGINE_FETCH } from '../src/modules/technical-analysis/ai-engine.client';
import { EventsService } from '../src/modules/websocket/events.service';
import { SignalGenerationService } from '../src/modules/signals/signal-generation.service';
import { SCANNER_CACHE_KEY } from '../src/modules/signals/scanner.constants';
import { fakeAiFetch } from './helpers/fake-ai';
import { accessTokenFor, createPhase7TestApp, type Phase7TestApp } from './helpers/test-app';

const SYMBOLS = ['EUR/USD', 'GBP/USD'] as const;

function bearer(token: string): string {
  return `Bearer ${token}`;
}

describe('P16 decision engine integration', () => {
  let harness: Phase7TestApp;
  let token: string;
  const ai = fakeAiFetch();
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://tradesense:tradesense@localhost:5433/tradesense_test';

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    await disconnect();
    harness = await createPhase7TestApp({
      configure: (builder) => builder.overrideProvider(AI_ENGINE_FETCH).useValue(ai.fetch),
    });
    token = await accessTokenFor(harness, 'USER');
    await seedHistory(harness.prisma, {
      symbols: [...SYMBOLS],
      timeframes: ['H1'],
      years: 0.1,
      end: new Date(),
    });
    await harness.prisma.tradeSignal.deleteMany({
      where: { pair: { symbol: { in: [...SYMBOLS] } } },
    });
    await harness.redis.del(SCANNER_CACHE_KEY);
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
    await disconnect();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }, 120_000);

  it('persists a versioned decision with evidence and a feature snapshot, then emits signal:new', async () => {
    const events = harness.moduleRef.get(EventsService, { strict: false });
    const signalNew = jest.spyOn(events, 'signalNew');
    const generation = harness.moduleRef.get(SignalGenerationService, { strict: false });

    const signal = await generation.generate('EUR/USD');

    expect(signal).toMatchObject({
      symbol: 'EUR/USD',
      score: expect.any(Number),
      probability: expect.any(Number),
      confidence: expect.any(Number),
      noTradeReasons: expect.any(Array),
      scores: {
        ...signal.scores,
        weightsVersion: expect.any(String),
        components: expect.any(Object),
        band: expect.any(String),
      },
    });
    expect(signal.supportingEvidence?.length).toBeGreaterThan(0);
    expect(signal.contradictingEvidence).toBeInstanceOf(Array);

    const row = await harness.prisma.tradeSignal.findUnique({
      where: { id: signal.id },
      include: { features: true, pair: true },
    });
    expect(row?.pair.symbol).toBe('EUR/USD');
    expect(row?.features).toHaveLength(1);
    expect(row?.features[0].featureVersion).toBeTruthy();
    expect(row?.scores).toMatchObject({ weightsVersion: expect.any(String) });
    expect(signalNew).toHaveBeenCalledWith({
      signalId: signal.id,
      symbol: 'EUR/USD',
      action: signal.action,
      score: signal.score,
    });
    signalNew.mockRestore();
  }, 120_000);

  it('emits signal:changed when a materially different decision replaces the previous one', async () => {
    const events = harness.moduleRef.get(EventsService, { strict: false });
    const signalChanged = jest.spyOn(events, 'signalChanged');
    const generation = harness.moduleRef.get(SignalGenerationService, { strict: false });
    const pair = await harness.prisma.currencyPair.findUniqueOrThrow({
      where: { symbol: 'EUR/USD' },
    });

    const previous = await harness.prisma.tradeSignal.create({
      data: {
        pairId: pair.id,
        action: 'LONG',
        score: 100,
        probability: 0.99,
        confidence: 0.99,
        riskLevel: 'EXTREME',
        direction: 'LONG',
        scores: {} as Prisma.InputJsonValue,
        reasons: [],
        noTradeReasons: [],
        status: 'ACTIVE',
        generatedAt: new Date(Date.now() + 60_000),
      },
    });

    const next = await generation.generate('EUR/USD');
    expect(signalChanged).toHaveBeenCalledWith({
      signalId: next.id,
      changes: expect.objectContaining({
        action: next.action,
        score: next.score,
        riskLevel: next.riskLevel,
      }),
    });
    signalChanged.mockRestore();

    await harness.prisma.tradeSignal.deleteMany({
      where: { id: { in: [previous.id, next.id] } },
    });
  }, 120_000);

  it('serves real recent signals and detail views over the existing routes', async () => {
    const recent = await request(harness.app.getHttpServer())
      .get('/api/v1/signals?symbol=EUR%2FUSD')
      .set('Authorization', bearer(token))
      .expect(200);
    expect(recent.body.success).toBe(true);
    expect(recent.body.data.items.length).toBeGreaterThan(0);
    expect(recent.body.data.items[0]).toMatchObject({
      symbol: 'EUR/USD',
      action: expect.any(String),
      score: expect.any(Number),
      noTradeReasons: expect.any(Array),
    });

    const id = recent.body.data.items[0].id as string;
    const detail = await request(harness.app.getHttpServer())
      .get(`/api/v1/signals/${id}`)
      .set('Authorization', bearer(token))
      .expect(200);
    expect(detail.body.data).toMatchObject({
      id,
      status: 'ACTIVE',
      featureVersion: expect.any(String),
      analyses: expect.any(Array),
      scores: { components: expect.any(Object), weightsVersion: expect.any(String) },
    });

    const forced = await request(harness.app.getHttpServer())
      .get('/api/v1/signals?forceAction=LONG')
      .set('Authorization', bearer(token))
      .expect(422);
    expect(forced.body.error.code).toBe('VALIDATION_ERROR');

    const missing = await request(harness.app.getHttpServer())
      .get('/api/v1/signals/sig_missing')
      .set('Authorization', bearer(token))
      .expect(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  }, 120_000);

  it('covers every active pair in a cached, sortable scanner snapshot', async () => {
    const first = await request(harness.app.getHttpServer())
      .get('/api/v1/scanner?sortBy=score&order=desc')
      .set('Authorization', bearer(token))
      .expect(200);
    expect(first.body.success).toBe(true);
    expect(first.body.data.items).toHaveLength(10);
    expect(new Set(first.body.data.items.map((row: { symbol: string }) => row.symbol))).toEqual(
      new Set([
        'EUR/USD',
        'GBP/USD',
        'USD/JPY',
        'USD/CHF',
        'AUD/USD',
        'USD/CAD',
        'NZD/USD',
        'EUR/GBP',
        'EUR/JPY',
        'GBP/JPY',
      ]),
    );
    for (const row of first.body.data.items) {
      expect(row).toMatchObject({
        symbol: expect.any(String),
        action: expect.any(String),
        score: expect.any(Number),
        probability: expect.any(Number),
        riskLevel: expect.any(String),
      });
    }

    const cached = await harness.redis.get(SCANNER_CACHE_KEY);
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached as string)).toMatchObject({
      generatedAt: expect.any(String),
      rows: expect.any(Array),
    });

    const ascending = await request(harness.app.getHttpServer())
      .get('/api/v1/scanner?sortBy=score&order=asc&limit=3')
      .set('Authorization', bearer(token))
      .expect(200);
    const scores = (ascending.body.data.items as Array<{ score: number }>).map((row) => row.score);
    expect(scores).toEqual([...scores].sort((left, right) => left - right));
    expect(ascending.body.data.items).toHaveLength(3);
  }, 180_000);

  it('sorts the scanner snapshot by every documented key', async () => {
    type Row = {
      symbol: string;
      score: number;
      probability: number;
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
      volatility?: number;
    };
    const rank = { LOW: 0, MEDIUM: 1, HIGH: 2, EXTREME: 3 } as const;
    const rowsFor = async (sortBy: string): Promise<Row[]> => {
      const response = await request(harness.app.getHttpServer())
        .get(`/api/v1/scanner?sortBy=${sortBy}&order=desc&limit=100`)
        .set('Authorization', bearer(token))
        .expect(200);
      expect(response.body.data.items).toHaveLength(10);
      return response.body.data.items as Row[];
    };

    const scores = (await rowsFor('score')).map((row) => row.score);
    expect(scores).toEqual([...scores].sort((left, right) => right - left));

    const probabilities = (await rowsFor('probability')).map((row) => row.probability);
    expect(probabilities).toEqual([...probabilities].sort((left, right) => right - left));

    const risks = (await rowsFor('risk')).map((row) => rank[row.riskLevel]);
    expect(risks).toEqual([...risks].sort((left, right) => right - left));

    const volatilities = (await rowsFor('volatility')).map((row) => row.volatility);
    const known = volatilities.filter((value): value is number => value !== undefined);
    expect(known).toEqual([...known].sort((left, right) => right - left));
    expect(volatilities.slice(known.length).every((value) => value === undefined)).toBe(true);
  }, 120_000);
});
