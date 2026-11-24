import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { FEATURE_NAMES, env } from '@ts/config';
import { disconnect } from '@ts/database';
import type { Timeframe } from '@ts/types';
import { configuration } from '../src/config/configuration';
import { FeaturesProcessor } from '../src/jobs/processors/features.processor';
import { FeatureService } from '../src/modules/market/feature.service';
import { AI_ENGINE_FETCH } from '../src/modules/technical-analysis/ai-engine.client';
import { seedHistory } from '../../../scripts/seed-history';
import { fakeFeaturesFetch } from './helpers/fake-ai';
import { accessTokenFor, createPhase7TestApp, type Phase7TestApp } from './helpers/test-app';

const END = new Date('2026-11-24T00:00:00.000Z');
const SYMBOLS = ['EUR/USD', 'GBP/USD'];
const TIMEFRAMES: Timeframe[] = ['D1'];

function bearer(token: string): string {
  return `Bearer ${token}`;
}

describe('P12 feature engineering engine', () => {
  let harness: Phase7TestApp;
  let userToken: string;
  const ai = fakeFeaturesFetch();
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
    userToken = await accessTokenFor(harness, 'USER');
    await harness.prisma.marketFeature.deleteMany({
      where: { featureVersion: env.FEATURE_VERSION },
    });
    await harness.prisma.newsAnalysis.deleteMany({ where: { article: { sourceUrl: 'p12-news' } } });
    await harness.prisma.newsArticle.deleteMany({ where: { sourceUrl: 'p12-news' } });
    await harness.prisma.economicEvent.deleteMany({ where: { eventName: 'P12 CPI' } });
    await seedHistory(harness.prisma, {
      symbols: SYMBOLS,
      timeframes: TIMEFRAMES,
      years: 2,
      end: END,
    });
    const article = await harness.prisma.newsArticle.create({
      data: {
        source: 'p12-fixture',
        sourceUrl: 'p12-news',
        title: 'P12 deterministic news fixture',
        publishedAt: new Date(END.getTime() - 3_600_000),
        currencies: ['EUR', 'USD'],
        contentHash: 'p12-news-hash',
      },
    });
    await harness.prisma.newsAnalysis.create({
      data: {
        articleId: article.id,
        eventType: 'MACRO',
        sentiment: 'BULLISH',
        impact: 'HIGH',
        confidence: 0.8,
        affectedPairs: ['EUR/USD'],
        analyzedBy: 'p12-fixture',
        analyzedAt: new Date(END.getTime() - 3_600_000),
      },
    });
    await harness.prisma.economicEvent.create({
      data: {
        eventName: 'P12 CPI',
        currency: 'USD',
        eventClass: 'INFLATION',
        scheduledAt: new Date(END.getTime() + 3_600_000),
        impact: 'EXTREME',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.prisma.marketFeature.deleteMany({
      where: { featureVersion: env.FEATURE_VERSION },
    });
    await harness?.prisma.newsAnalysis.deleteMany({
      where: { article: { sourceUrl: 'p12-news' } },
    });
    await harness?.prisma.newsArticle.deleteMany({ where: { sourceUrl: 'p12-news' } });
    await harness?.prisma.economicEvent.deleteMany({ where: { eventName: 'P12 CPI' } });
    await harness?.close();
    await disconnect();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }, 120_000);

  it('wires the real features processor', () => {
    expect(harness.moduleRef.get(FeaturesProcessor)).toBeDefined();
  });

  it('generates versioned vectors for all seeded history and reruns idempotently', async () => {
    const features = harness.moduleRef.get(FeatureService);
    const before = ai.calls.length;
    const first = await features.regenerate({
      symbols: SYMBOLS,
      timeframes: TIMEFRAMES,
      asOf: END,
    });
    expect(first.featureVersion).toBe(env.FEATURE_VERSION);
    expect(first.pairs).toBe(SYMBOLS.length);
    expect(first.timeframes).toBe(TIMEFRAMES.length);
    expect(first.vectors).toBeGreaterThanOrEqual(200 * SYMBOLS.length);

    const rows = await harness.prisma.marketFeature.findMany({
      where: { featureVersion: env.FEATURE_VERSION },
      orderBy: [{ pairId: 'asc' }, { timestamp: 'asc' }],
    });
    expect(rows).toHaveLength(first.vectors);
    for (const row of rows) {
      expect(Object.keys(row.values as Record<string, unknown>).sort()).toEqual(
        [...FEATURE_NAMES].sort(),
      );
    }
    const ids = rows.map((row) => row.id);
    const values = rows.map((row) => JSON.stringify(row.values));
    const calls = ai.calls.slice(before);

    const second = await features.regenerate({
      symbols: SYMBOLS,
      timeframes: TIMEFRAMES,
      asOf: END,
    });
    const rerun = await harness.prisma.marketFeature.findMany({
      where: { featureVersion: env.FEATURE_VERSION },
      orderBy: [{ pairId: 'asc' }, { timestamp: 'asc' }],
    });
    expect(second.vectors).toBe(first.vectors);
    expect(rerun.map((row) => row.id)).toEqual(ids);
    expect(rerun.map((row) => JSON.stringify(row.values))).toEqual(values);

    expect(calls.length).toBe(first.batches);
    expect(calls[0].url).toBe(`${configuration.app.aiUrl}/api/v1/ai/features`);
    expect(calls[0].init?.headers).toMatchObject({
      'X-Service-Token': configuration.app.aiServiceToken,
    });
    expect(calls[0].body.candles?.length).toBeLessThanOrEqual(500);
    expect(calls[0].body.timestamps?.length).toBeLessThanOrEqual(500);
    expect(calls[0].body.news).toHaveLength(1);
    expect(calls[0].body.events).toHaveLength(1);
    expect(calls[0].body.featureVersion).toBe(env.FEATURE_VERSION);
  }, 120_000);

  it('reads the latest manifest-shaped vector for prediction and scoring', async () => {
    const features = harness.moduleRef.get(FeatureService);
    const vector = await features.latest('EUR/USD', 'D1', END);
    expect(vector.featureVersion).toBe(env.FEATURE_VERSION);
    expect(Date.parse(vector.timestamp)).toBeLessThanOrEqual(END.getTime());
    expect(Object.keys(vector.features).sort()).toEqual([...FEATURE_NAMES].sort());
  });

  it('serves live feature-space NN similarity over the historical route', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/analysis/EUR%2FUSD/historical?timeframe=D1&limit=3')
      .set('Authorization', bearer(userToken))
      .expect(200);
    expect(response.body.data).toMatchObject({
      symbol: 'EUR/USD',
      timeframe: 'D1',
      similarityMethod: 'feature-euclidean-v1.0',
    });
    expect(response.body.data.similarConditions.length).toBeGreaterThan(0);
    expect(response.body.data.similarConditions.length).toBeLessThanOrEqual(3);
    for (const window of response.body.data.similarConditions) {
      expect(Date.parse(window.timestamp)).toBeLessThan(Date.parse(response.body.data.asOf));
      expect(window.distance).toBeGreaterThanOrEqual(0);
      expect(typeof window.close).toBe('number');
    }
  });

  it('returns INSUFFICIENT_DATA when a required feature is absent', async () => {
    const features = harness.moduleRef.get(FeatureService);
    const pair = await harness.prisma.currencyPair.findUniqueOrThrow({
      where: { symbol: 'EUR/USD' },
      select: { id: true },
    });
    await harness.prisma.marketFeature.upsert({
      where: {
        feature_pair_timeframe_timestamp_version_key: {
          pairId: pair.id,
          timeframe: 'D1',
          timestamp: new Date(END.getTime() + 3_600_000),
          featureVersion: env.FEATURE_VERSION,
        },
      },
      create: {
        pairId: pair.id,
        timeframe: 'D1',
        timestamp: new Date(END.getTime() + 3_600_000),
        featureVersion: env.FEATURE_VERSION,
        values: { rsi14: 50 },
      },
      update: { values: { rsi14: 50 } },
    });
    await expect(features.latest('EUR/USD', 'D1', END.getTime() + 3_600_000)).rejects.toMatchObject(
      {
        status: 422,
        response: { code: 'INSUFFICIENT_DATA' },
      },
    );
    await harness.prisma.marketFeature.delete({
      where: {
        feature_pair_timeframe_timestamp_version_key: {
          pairId: pair.id,
          timeframe: 'D1',
          timestamp: new Date(END.getTime() + 3_600_000),
          featureVersion: env.FEATURE_VERSION,
        },
      },
    });
  });
});
