import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { disconnect } from '@ts/database';
import { configuration } from '../src/config/configuration';
import { AI_ENGINE_FETCH } from '../src/modules/technical-analysis/ai-engine.client';
import {
  lastRegimeKey,
  MAX_TA_CANDLES,
  TA_TTL_SECONDS,
} from '../src/modules/technical-analysis/technical-analysis.service';
import { EventsService } from '../src/modules/websocket/events.service';
import { fakeAiFetch } from './helpers/fake-ai';
import { accessTokenFor, createPhase7TestApp, type Phase7TestApp } from './helpers/test-app';
import { seedHistory } from '../../../scripts/seed-history';

function bearer(token: string): string {
  return `Bearer ${token}`;
}

describe('P10 technical analysis engine', () => {
  let harness: Phase7TestApp;
  let app: Phase7TestApp['app'];
  let userToken: string;
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
    app = harness.app;
    userToken = await accessTokenFor(harness, 'USER');
    await seedHistory(harness.prisma, {
      symbols: ['EUR/USD', 'GBP/USD'],
      timeframes: ['H1', 'D1'],
      years: 0.1,
      end: new Date(),
    });
  }, 120_000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await harness?.close();
    await disconnect();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }, 120_000);

  async function clearTaCache(symbol?: string): Promise<void> {
    for (const key of [...harness.redis.snapshot().keys()]) {
      if (key.startsWith('ta:') && (symbol === undefined || key.includes(symbol))) {
        await harness.redis.del(key);
      }
    }
  }

  it('computes through AI, persists indicators, then serves a stable cache hit', async () => {
    const regimeSpy = jest.spyOn(app.get(EventsService), 'regimeChanged');
    await clearTaCache('EUR/USD');
    const before = ai.calls.length;
    const path = '/api/v1/analysis/EUR%2FUSD/technical?timeframe=H1';

    const response = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', bearer(userToken))
      .expect(200);

    expect(response.body.data).toMatchObject({
      symbol: 'EUR/USD',
      timeframe: 'H1',
      source: 'ai',
      indicators: {
        RSI14: { value: 61.24 },
        OBV: { indicative: true },
      },
      patterns: [expect.objectContaining({ pattern: 'HAMMER' })],
      regime: { regime: 'WEAK_UPTREND', confidence: 0.62 },
      score: { score: 68.4, evidenceCount: 42 },
    });
    expect(response.body.data.metadata.indicatorVersion).toBe('p10.1');
    expect(response.body.data.metadata.indicativeNote).toContain('spot forex');
    expect(response.body.data.patterns[0].context).toMatchObject({
      trend: 'UP',
      regime: 'WEAK_UPTREND',
    });

    expect(ai.calls).toHaveLength(before + 1);
    const call = ai.calls[ai.calls.length - 1];
    expect(call.url).toBe(`${configuration.app.aiUrl}/api/v1/ai/indicators`);
    expect(call.init?.headers).toMatchObject({
      'X-Service-Token': configuration.app.aiServiceToken,
    });
    expect(call.body.candles?.length).toBe(MAX_TA_CANDLES);
    expect(call.body.candles?.[0]).toMatchObject({
      timestamp: expect.any(String),
      open: expect.any(Number),
      high: expect.any(Number),
      low: expect.any(Number),
      close: expect.any(Number),
    });
    expect(regimeSpy).not.toHaveBeenCalled();

    const persisted = await harness.prisma.technicalIndicator.findMany({
      where: { name: 'RSI14' },
      take: 1,
    });
    expect(persisted).toHaveLength(1);
    expect(Number((persisted[0].value as { value?: number }).value ?? persisted[0].value)).toBe(
      61.24,
    );
    const feature = await harness.prisma.marketFeature.findMany({
      where: { featureVersion: 'regime-v1' },
      take: 1,
    });
    expect(feature).toHaveLength(1);

    const keys = [...harness.redis.snapshot().keys()].filter((key) => key.startsWith('ta:'));
    const technicalKey = keys.find((key) => key.startsWith('ta:EUR/USD:H1:'));
    expect(technicalKey).toBeDefined();
    expect(await harness.redis.ttl(technicalKey as string)).toBe(TA_TTL_SECONDS);
    expect(keys).toEqual(expect.arrayContaining(['ta:regime:EUR/USD:H1']));

    const cached = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', bearer(userToken))
      .expect(200);
    expect(cached.body.data.source).toBe('cache');
    expect(cached.body.data.score.score).toBe(response.body.data.score.score);
    expect(ai.calls).toHaveLength(before + 1);
  });

  it('passes bounded indicator filters to the engine', async () => {
    const before = ai.calls.length;
    const response = await request(app.getHttpServer())
      .get('/api/v1/analysis/EUR%2FUSD/technical?timeframe=H1&indicators=RSI14&indicators=MACD')
      .set('Authorization', bearer(userToken))
      .expect(200);

    expect(response.body.data.metadata.requested).toEqual(['RSI14', 'MACD']);
    expect(ai.calls).toHaveLength(before + 1);
    expect(ai.calls[ai.calls.length - 1].body.indicators).toEqual(['RSI14', 'MACD']);
  });

  it('serves the cached regime snapshot', async () => {
    const before = ai.calls.length;
    const response = await request(app.getHttpServer())
      .get('/api/v1/analysis/EUR%2FUSD/regime')
      .set('Authorization', bearer(userToken))
      .expect(200);

    expect(response.body.data).toMatchObject({
      symbol: 'EUR/USD',
      timeframe: 'H1',
      source: 'cache',
      regime: 'WEAK_UPTREND',
      confidence: 0.62,
    });
    expect(ai.calls).toHaveLength(before);
  });

  it('emits regime:changed when the classification changes', async () => {
    const regimeSpy = jest.spyOn(app.get(EventsService), 'regimeChanged');
    await clearTaCache('GBP/USD');
    await harness.redis.set(lastRegimeKey('GBP/USD', 'H1'), 'STRONG_DOWNTREND');

    await request(app.getHttpServer())
      .get('/api/v1/analysis/GBP%2FUSD/technical?timeframe=H1')
      .set('Authorization', bearer(userToken))
      .expect(200);

    expect(regimeSpy).toHaveBeenCalledWith({
      symbol: 'GBP/USD',
      regime: 'WEAK_UPTREND',
    });
    expect(await harness.redis.get(lastRegimeKey('GBP/USD', 'H1'))).toBe('WEAK_UPTREND');
  });

  it('assembles the combined assessment from real technical and historical data', async () => {
    const eventSpy = jest.spyOn(app.get(EventsService), 'analysisUpdated');
    const response = await request(app.getHttpServer())
      .get('/api/v1/analysis/EUR%2FUSD')
      .set('Authorization', bearer(userToken))
      .expect(200);

    expect(response.body.data).toMatchObject({
      symbol: 'EUR/USD',
      timeframe: 'H1',
      pendingPhases: ['P11', 'P12', 'P17'],
      regime: { regime: 'WEAK_UPTREND' },
      technical: { symbol: 'EUR/USD', score: { score: 68.4 } },
      historical: { symbol: 'EUR/USD', timeframe: 'D1' },
      prediction: null,
      modelStatus: 'TRAINING',
      signalPolicy: { weight: 0, block: true },
    });
    expect(eventSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown symbols before calling the AI engine', async () => {
    const before = ai.calls.length;
    await request(app.getHttpServer())
      .get('/api/v1/analysis/ABC%2FXYZ/technical')
      .set('Authorization', bearer(userToken))
      .expect(404);
    expect(ai.calls).toHaveLength(before);
  });
});
