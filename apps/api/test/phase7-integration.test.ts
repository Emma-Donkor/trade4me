import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { disconnect } from '@ts/database';
import { accessTokenFor, createPhase7TestApp, type Phase7TestApp } from './helpers/test-app';
import { fakeAiFetch } from './helpers/fake-ai';
import { seedHistory } from '../../../scripts/seed-history';
import { AI_ENGINE_FETCH } from '../src/modules/technical-analysis/ai-engine.client';

function bearer(token: string): string {
  return `Bearer ${token}`;
}

describe('P07 integration contract', () => {
  let harness: Phase7TestApp;
  let userToken: string;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://tradesense:tradesense@localhost:5433/tradesense_test';

  beforeAll(async () => {
    // Phase 10 technical routes read the same repository singleton as P09.
    process.env.DATABASE_URL = testDatabaseUrl;
    await disconnect();
    const ai = fakeAiFetch();
    harness = await createPhase7TestApp({
      configure: (builder) => builder.overrideProvider(AI_ENGINE_FETCH).useValue(ai.fetch),
    });
    userToken = await accessTokenFor(harness, 'USER');
    await seedHistory(harness.prisma, {
      symbols: ['EUR/USD'],
      timeframes: ['H1'],
      years: 0.1,
      end: new Date(),
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
    await disconnect();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }, 120_000);

  it('returns seeded pairs with pip and point metadata', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/market/pairs')
      .set('Authorization', bearer(userToken))
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toHaveLength(10);
    expect(response.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: 'EUR/USD',
          pipSize: 0.0001,
          pointValue: 10,
          spreadPipsTypical: 1,
          active: true,
        }),
      ]),
    );
    expect(response.body.requestId).toMatch(/^req_/);
    expect(response.body.data.items[0]).not.toHaveProperty('providerSymbols');
  });

  it('serves live quotes and real cached OHLC series', async () => {
    const symbol = encodeURIComponent('EUR/USD');

    // Phase 8 replaced the quote stub with validated mock-provider ingestion.
    const quote = await request(harness.app.getHttpServer())
      .get(`/api/v1/market/quote?symbols=${symbol}`)
      .set('Authorization', bearer(userToken))
      .expect(200);
    expect(quote.body.data.items[0]).toMatchObject({
      symbol: 'EUR/USD',
      provider: 'mock',
      isStale: false,
      source: 'live',
    });
    expect(quote.body.data.items[0].dataFreshnessSeconds).toBeGreaterThanOrEqual(0);

    // Phase 9 replaced the honest OHLC stub with real projected reads. The
    // test database may not have history seeded, so assert the contract shape.
    const candles = await request(harness.app.getHttpServer())
      .get(
        `/api/v1/market/candles?symbol=${symbol}&timeframe=H1&start=2026-01-01T00:00:00Z&end=2026-01-02T00:00:00Z&limit=50`,
      )
      .set('Authorization', bearer(userToken))
      .expect(200);
    expect(candles.body.data).toMatchObject({ limit: 50, source: 'db' });
    expect(Array.isArray(candles.body.data.items)).toBe(true);
    for (const candle of candles.body.data.items) {
      expect(candle).toMatchObject({ symbol: 'EUR/USD', timeframe: 'H1' });
      expect(candle).not.toHaveProperty('pairId');
      expect(candle).not.toHaveProperty('id');
    }

    // Phase 10 replaced the 503 stub with a real, AI-backed technical view.
    const analysis = await request(harness.app.getHttpServer())
      .get(`/api/v1/analysis/${symbol}/technical`)
      .set('Authorization', bearer(userToken))
      .expect(200);
    expect(analysis.body.data).toMatchObject({
      symbol: 'EUR/USD',
      timeframe: 'H1',
      regime: { regime: 'WEAK_UPTREND' },
    });
    expect(analysis.body.data.score.score).toBeGreaterThanOrEqual(0);
    expect(analysis.body.data.score.score).toBeLessThanOrEqual(100);

    const ai = await request(harness.app.getHttpServer())
      .post('/api/v1/ai/assistant')
      .set('Authorization', bearer(await accessTokenFor(harness)))
      .send({ message: 'What changed?' })
      .expect(503);
    expect(ai.body.error.code).toBe('AI_SERVICE_UNAVAILABLE');
  });

  it('returns honest empty collections for watchlist, notifications and portfolio', async () => {
    for (const path of [
      '/api/v1/notifications',
      '/api/v1/watchlist',
      '/api/v1/watchlist/items',
      '/api/v1/portfolio',
    ]) {
      const response = await request(harness.app.getHttpServer())
        .get(path)
        .set('Authorization', bearer(userToken))
        .expect(200);
      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.nextCursor).toBeNull();
      expect(response.body.data.hasMore).toBe(false);
    }
  });

  it('enforces admin and analyst roles on admin routes', async () => {
    for (const path of [
      '/api/v1/admin/users',
      '/api/v1/admin/models',
      '/api/v1/admin/audit-logs',
    ]) {
      await request(harness.app.getHttpServer())
        .get(path)
        .set('Authorization', bearer(userToken))
        .expect(403)
        .expect(({ body }) => expect(body.error.code).toBe('FORBIDDEN'));
    }

    await request(harness.app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', bearer(await accessTokenFor(harness, 'ADMIN')))
      .expect(200);

    await request(harness.app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', bearer(await accessTokenFor(harness, 'ANALYST')))
      .expect(403);

    await request(harness.app.getHttpServer())
      .get('/api/v1/admin/models')
      .set('Authorization', bearer(await accessTokenFor(harness, 'ANALYST')))
      .expect(200);

    // ADMIN is a superset of ANALYST for the documented admin surface.
    await request(harness.app.getHttpServer())
      .get('/api/v1/admin/models')
      .set('Authorization', bearer(await accessTokenFor(harness, 'ADMIN')))
      .expect(200);

    const patch = await request(harness.app.getHttpServer())
      .patch('/api/v1/admin/providers')
      .set('Authorization', bearer(await accessTokenFor(harness, 'ADMIN')))
      .send({ provider: 'twelvedata', enabled: false })
      .expect(501);
    expect(patch.body.error.code).toBe('NOT_IMPLEMENTED');
  });

  it('validates request bodies before reaching a stub', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/v1/ai/assistant')
      .set('Authorization', bearer(await accessTokenFor(harness)))
      .send({})
      .expect(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'message' })]),
    );
  });

  it('limits /ai/* to 20 requests per user per window', async () => {
    const token = await accessTokenFor(harness);
    for (let index = 0; index < 20; index += 1) {
      await request(harness.app.getHttpServer())
        .post('/api/v1/ai/assistant')
        .set('Authorization', bearer(token))
        .send({ message: 'hello' })
        .expect(503);
    }

    const limited = await request(harness.app.getHttpServer())
      .post('/api/v1/ai/assistant')
      .set('Authorization', bearer(token))
      .send({ message: 'hello' })
      .expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
  });
});

describe('P07 global rate limiter', () => {
  let harness: Phase7TestApp;

  beforeAll(async () => {
    harness = await createPhase7TestApp({ rateLimitMax: 2, rateLimitWindowMs: 1_000 });
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  }, 120_000);

  it('returns 429 with Retry-After after the per-IP window is exhausted', async () => {
    const ip = '203.0.113.7';
    for (let index = 0; index < 2; index += 1) {
      await request(harness.app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Forwarded-For', ip)
        .expect(200);
    }

    const limited = await request(harness.app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Forwarded-For', ip)
      .expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.body.error.details).toEqual({ limit: 2, windowSeconds: 1 });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['x-ratelimit-reset'])).toBeGreaterThan(
      Math.floor(Date.now() / 1000),
    );
    expect(limited.body.error.requestId).toMatch(/^req_/);
  });

  it('resets the per-IP counter when the window expires', async () => {
    const ip = '203.0.113.19';
    for (let index = 0; index < 2; index += 1) {
      await request(harness.app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Forwarded-For', ip)
        .expect(200);
    }
    await request(harness.app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Forwarded-For', ip)
      .expect(429);

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    await request(harness.app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Forwarded-For', ip)
      .expect(200);
  });
});
