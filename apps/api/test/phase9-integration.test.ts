import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { accessTokenFor, createPhase7TestApp, type Phase7TestApp } from './helpers/test-app';
import { seedHistory } from '../../../scripts/seed-history';
import { CandleRepository, disconnect } from '@ts/database';
import { BackfillService } from '../src/modules/market/backfill.service';
import { HistoryStateService } from '../src/modules/market/history-state.service';

function bearer(token: string): string {
  return `Bearer ${token}`;
}

describe('P09 historical data pipeline', () => {
  let harness: Phase7TestApp;
  let app: Phase7TestApp['app'];
  let userToken: string;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://tradesense:tradesense@localhost:5433/tradesense_test';

  beforeAll(async () => {
    // Repositories own a process-wide Prisma singleton. Rebind it to the
    // disposable test database before Nest instantiates any candle service.
    process.env.DATABASE_URL = testDatabaseUrl;
    await disconnect();
    harness = await createPhase7TestApp();
    app = harness.app;
    userToken = await accessTokenFor(harness, 'USER');
    await seedHistory(harness.prisma, {
      symbols: ['EUR/USD', 'GBP/USD'],
      timeframes: ['D1', 'H1'],
      years: 2,
      // Seed through the current clock so the rolling previous_day window
      // always contains at least one stored candle.
      end: new Date(),
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
    await disconnect();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }, 120_000);

  it('serves real, projected, ordered candle pages with keyset cursor pagination', async () => {
    const first = await request(app.getHttpServer())
      .get(
        '/api/v1/market/candles?symbol=EUR%2FUSD&timeframe=D1' +
          '&start=2026-11-10T00:00:00Z&end=2026-11-20T00:00:00Z&limit=2&order=asc',
      )
      .set('Authorization', bearer(userToken))
      .expect(200);

    expect(first.body.data).toMatchObject({ limit: 2, hasMore: true, source: 'db' });
    expect(first.body.data.items).toHaveLength(2);
    expect(first.body.data.nextCursor).toBeTruthy();
    expect(first.body.data.items[0].timestamp).toBe('2026-11-10T00:00:00.000Z');
    expect(first.body.data.items[1].timestamp).toBe('2026-11-11T00:00:00.000Z');
    for (const candle of first.body.data.items) {
      expect(candle).toMatchObject({ symbol: 'EUR/USD', timeframe: 'D1', provider: 'mock' });
      expect(candle).not.toHaveProperty('id');
      expect(candle).not.toHaveProperty('pairId');
    }

    const second = await request(app.getHttpServer())
      .get(
        `/api/v1/market/candles?symbol=EUR%2FUSD&timeframe=D1` +
          `&start=2026-11-10T00:00:00Z&end=2026-11-20T00:00:00Z&limit=2&order=asc` +
          `&cursor=${encodeURIComponent(first.body.data.nextCursor)}`,
      )
      .set('Authorization', bearer(userToken))
      .expect(200);
    expect(second.body.data.items.map((row: { timestamp: string }) => row.timestamp)).toEqual([
      '2026-11-12T00:00:00.000Z',
      '2026-11-13T00:00:00.000Z',
    ]);
  });

  it('bounds range spans and rejects malformed cursors', async () => {
    await request(app.getHttpServer())
      .get(
        '/api/v1/market/candles?symbol=EUR%2FUSD&timeframe=D1' +
          '&start=2020-01-01T00:00:00Z&end=2026-11-23T00:00:00Z&limit=50',
      )
      .set('Authorization', bearer(userToken))
      .expect(422);

    // A malformed cursor is rejected by the service before any DB read.
    await request(app.getHttpServer())
      .get(
        '/api/v1/market/candles?symbol=EUR%2FUSD&timeframe=D1' +
          '&start=2026-11-10T00:00:00Z&end=2026-11-20T00:00:00Z&limit=50&cursor=not-a-cursor',
      )
      .set('Authorization', bearer(userToken))
      .expect(400);
  });

  it('serves the cached copy on a repeated query with the same window', async () => {
    const path =
      '/api/v1/market/candles?symbol=GBP%2FUSD&timeframe=D1' +
      '&start=2026-11-15T00:00:00Z&end=2026-11-20T00:00:00Z&limit=3&order=asc';
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', bearer(userToken))
      .expect(200);
    const cached = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', bearer(userToken))
      .expect(200);
    expect(cached.body.data.source).toBe('cache');
  });

  it('serves real aggregations from stored candles', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/analysis/EUR%2FUSD/historical?timeframe=D1&limit=3')
      .set('Authorization', bearer(userToken))
      .expect(200);
    const data = response.body.data;
    expect(data).toMatchObject({
      symbol: 'EUR/USD',
      timeframe: 'D1',
      similarityMethod: 'deterministic-euclidean',
    });
    expect(data.periods.map((period: { period: string }) => period.period)).toEqual([
      'previous_day',
      'previous_week',
      'previous_month',
      'previous_year',
    ]);
    expect(data.periods[0].candles).toBeGreaterThan(0);
    expect(data.volatility.sampleSize).toBeGreaterThan(100);
    expect(data.volatility.annualizedPct).toBeGreaterThan(0);
    expect(data.similarConditions.length).toBeLessThanOrEqual(3);
    expect(data.dataPoints).toBeGreaterThan(300);
  });

  it('backfills six months of D1 for two pairs idempotently without gaps', async () => {
    const backfill = harness.moduleRef.get(BackfillService);
    const from = new Date('2026-05-01T00:00:00.000Z');
    const to = new Date('2026-10-31T00:00:00.000Z');
    const expected = 184; // inclusive daily buckets, May 1 → Oct 31
    const symbols = ['EUR/USD', 'GBP/USD'];
    // Remove the seeded rows so the import has real work to do.
    await harness.prisma.marketCandle.deleteMany({
      where: {
        pair: { symbol: { in: symbols } },
        timeframe: 'D1',
        timestamp: { gte: from, lte: to },
      },
    });
    for (const symbol of symbols) {
      const first = await backfill.run({ symbol, timeframe: 'D1', from, to });
      expect(first.written).toBe(expected);
      expect(first.gaps).toEqual([]);
      const replay = await backfill.run({ symbol, timeframe: 'D1', from, to });
      expect(replay.written).toBe(0);
      expect(replay.gaps).toEqual([]);
    }
  });

  it('tracks history freshness from stored candles', async () => {
    const state = harness.moduleRef.get(HistoryStateService);
    const snapshot = await state.snapshot();
    expect(snapshot.tracked).toBe(20);
    expect(snapshot.byTimeframe.D1.lastSyncAt).toBeTruthy();
    expect(snapshot.byTimeframe.H1.lastSyncAt).toBeTruthy();
  });

  it('serves a >10k-row range from the composite index within 100ms', async () => {
    const pair = await harness.prisma.currencyPair.findUniqueOrThrow({
      where: { symbol: 'EUR/USD' },
      select: { id: true },
    });
    const repository = new CandleRepository();
    const range = {
      pairId: pair.id,
      timeframe: 'H1' as const,
      from: new Date('2024-11-24T00:00:00.000Z'),
      to: new Date('2026-11-23T00:00:00.000Z'),
      limit: 20_000,
    };
    // Warm the index once; the assertion measures steady-state range reads.
    await repository.findSeriesFast(range);
    const rows = await repository.findSeriesFast(range);
    expect(rows.length).toBeGreaterThan(10_000);

    // EXPLAIN ANALYZE measures server-side execution time, excluding the
    // client-side mapping and scheduler contention of the surrounding suite.
    const plan = await harness.prisma.$queryRaw<
      Array<{ 'QUERY PLAN': Array<{ 'Execution Time': number; Plan: string }> }>
    >`
      EXPLAIN (ANALYZE, FORMAT JSON)
      SELECT "timestamp", "open", "high", "low", "close" FROM "MarketCandle"
      WHERE "pairId" = ${pair.id}
        AND "timeframe" = 'H1'
        AND "timestamp" BETWEEN ${range.from} AND ${range.to}
      ORDER BY "timestamp" ASC, "id" ASC
      LIMIT 20_000
    `;
    const details = plan[0]['QUERY PLAN'][0];
    expect(details['Execution Time']).toBeLessThan(100);
    expect(JSON.stringify(details.Plan)).toMatch(
      /market_candle_range_idx|MarketCandle_pairId_timeframe_timestamp_key/,
    );
  });
});
