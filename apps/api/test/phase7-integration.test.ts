import request from 'supertest';
import { accessTokenFor, createPhase7TestApp, type Phase7TestApp } from './helpers/test-app';

function bearer(token: string): string {
  return `Bearer ${token}`;
}

describe('P07 integration contract', () => {
  let harness: Phase7TestApp;
  let userToken: string;

  beforeAll(async () => {
    harness = await createPhase7TestApp();
    userToken = await accessTokenFor(harness, 'USER');
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
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
  });

  it('fails honestly for unimplemented market, analysis and AI routes', async () => {
    const symbol = encodeURIComponent('EUR/USD');

    const quote = await request(harness.app.getHttpServer())
      .get(`/api/v1/market/quote?symbol=${symbol}`)
      .set('Authorization', bearer(userToken))
      .expect(422);
    expect(quote.body.error.code).toBe('INSUFFICIENT_DATA');

    const candles = await request(harness.app.getHttpServer())
      .get(
        `/api/v1/market/candles?symbol=${symbol}&timeframe=H1&from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z`,
      )
      .set('Authorization', bearer(userToken))
      .expect(422);
    expect(candles.body.error.code).toBe('INSUFFICIENT_DATA');

    const analysis = await request(harness.app.getHttpServer())
      .get(`/api/v1/analysis/${symbol}/technical`)
      .set('Authorization', bearer(userToken))
      .expect(503);
    expect(analysis.body.error.code).toBe('AI_SERVICE_UNAVAILABLE');

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
    await request(harness.app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', bearer(userToken))
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('FORBIDDEN'));

    await request(harness.app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', bearer(await accessTokenFor(harness, 'ADMIN')))
      .expect(200);

    await request(harness.app.getHttpServer())
      .get('/api/v1/admin/models')
      .set('Authorization', bearer(await accessTokenFor(harness, 'ANALYST')))
      .expect(200);
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
    harness = await createPhase7TestApp({ rateLimitMax: 2 });
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
    expect(limited.body.error.details).toEqual({ limit: 2, windowSeconds: 60 });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.body.error.requestId).toMatch(/^req_/);
  });
});
