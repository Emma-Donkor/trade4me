import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { FEATURE_NAMES, env } from '@ts/config';
import { disconnect } from '@ts/database';
import type { Prisma } from '@ts/database';
import { configuration } from '../src/config/configuration';
import { DriftProcessor } from '../src/jobs/processors/drift.processor';
import {
  labelStartOf,
  OutcomesProcessor,
  resolveMove,
} from '../src/jobs/processors/outcomes.processor';
import { QUEUE_NAMES } from '../src/jobs/queues';
import { CRON_REGISTRATIONS } from '../src/jobs/schedulers';
import { PredictionEngineService } from '../src/modules/prediction/prediction-engine.service';
import { EventsService } from '../src/modules/websocket/events.service';
import {
  AiEngineClient,
  AI_ENGINE_FETCH,
  type AiFetch,
} from '../src/modules/technical-analysis/ai-engine.client';
import { fakeDriftFetch, fakePredictFetch } from './helpers/fake-ai';
import { createPhase7TestApp, type Phase7TestApp } from './helpers/test-app';

const SYMBOL = 'EUR/USD';
const END = new Date('2026-11-24T00:00:00.000Z');
const VECTOR = Object.fromEntries(
  FEATURE_NAMES.map((name, index) => [name, Number(((index % 7) / 10).toFixed(6))]),
);

type Handle = (data: Record<string, unknown>) => Promise<void>;

describe('P14 prediction engine', () => {
  let harness: Phase7TestApp;
  let versionId: string;
  let predictionId: string;
  const predictAi = fakePredictFetch({ modelVersion: 'p14-test-1.0.0' });
  const driftAi = fakeDriftFetch({ modelVersion: 'p14-test-1.0.0' });
  const aiFetch: AiFetch = async (url, init) => {
    if (url.endsWith('/api/v1/ai/predict')) return predictAi.fetch(url, init);
    if (url.endsWith('/api/v1/ai/ml/drift')) return driftAi.fetch(url, init);
    throw new Error(`unexpected AI route in P14 test: ${url}`);
  };
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://tradesense:tradesense@localhost:5433/tradesense_test';

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    await disconnect();
    harness = await createPhase7TestApp({
      configure: (builder) => builder.overrideProvider(AI_ENGINE_FETCH).useValue(aiFetch),
    });
    await harness.prisma.predictionOutcome.deleteMany({
      where: { prediction: { modelVersion: { name: 'p14-test' } } },
    });
    await harness.prisma.prediction.deleteMany({ where: { modelVersion: { name: 'p14-test' } } });
    await harness.prisma.modelRun.deleteMany({ where: { modelVersion: { name: 'p14-test' } } });
    await harness.prisma.modelVersion.deleteMany({ where: { name: 'p14-test' } });
    await harness.prisma.marketFeature.deleteMany({
      where: {
        featureVersion: env.FEATURE_VERSION,
        pair: { symbol: SYMBOL },
        timestamp: { gte: new Date(END.getTime() - 86_400_000), lte: END },
      },
    });
    await harness.prisma.currencyPair.upsert({
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
    const pair = await harness.prisma.currencyPair.findUniqueOrThrow({
      where: { symbol: SYMBOL },
    });
    const version = await harness.prisma.modelVersion.create({
      data: {
        name: 'p14-test',
        version: '1.0.0',
        featureVersion: env.FEATURE_VERSION,
        trainingDatasetVersion: 'p14-dataset',
        hyperparams: {},
        metrics: { rocAuc: 0.8, brier: 0.15 },
        status: 'ACTIVE',
      },
    });
    versionId = version.id;
    await harness.prisma.modelRun.create({
      data: {
        modelVersionId: versionId,
        startedAt: new Date(END.getTime() - 3_600_000),
        finishedAt: new Date(END.getTime() - 1_800_000),
        trainRange: {},
        testRange: {},
        seed: 42,
        artifactsPath: './models/p14-test/1.0.0',
        metrics: {},
      },
    });
    await harness.prisma.marketFeature.create({
      data: {
        pairId: pair.id,
        timeframe: 'H1',
        timestamp: END,
        featureVersion: env.FEATURE_VERSION,
        values: VECTOR as Prisma.InputJsonValue,
      },
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.prisma.predictionOutcome.deleteMany({
      where: { prediction: { modelVersion: { name: 'p14-test' } } },
    });
    await harness?.prisma.prediction.deleteMany({ where: { modelVersion: { name: 'p14-test' } } });
    await harness?.prisma.modelRun.deleteMany({ where: { modelVersion: { name: 'p14-test' } } });
    await harness?.prisma.modelVersion.deleteMany({ where: { name: 'p14-test' } });
    await harness?.prisma.systemEvent.deleteMany({ where: { code: 'model_performance_warning' } });
    await harness?.prisma.marketFeature.deleteMany({
      where: { featureVersion: env.FEATURE_VERSION, pair: { symbol: SYMBOL }, timestamp: END },
    });
    await harness?.prisma.marketCandle.deleteMany({
      where: {
        pair: { symbol: SYMBOL },
        timestamp: {
          gte: new Date(END.getTime() - 3_600_000),
          lte: new Date(END.getTime() + 3_600_000),
        },
      },
    });
    await harness?.close();
    await disconnect();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }, 120_000);

  it('wires the outcomes/drift processors and their queues', () => {
    expect(harness.moduleRef.get(OutcomesProcessor)).toBeDefined();
    expect(harness.moduleRef.get(DriftProcessor)).toBeDefined();
    expect(harness.moduleRef.get(PredictionEngineService)).toBeDefined();
    expect(QUEUE_NAMES).toContain('outcomes');
    expect(QUEUE_NAMES).toContain('drift');
    expect(CRON_REGISTRATIONS.find((item) => item.queue === 'outcomes')?.name).toBe(
      'prediction-outcomes',
    );
    expect(CRON_REGISTRATIONS.find((item) => item.queue === 'drift')).toMatchObject({
      name: 'model-drift-daily',
      pattern: '0 6 * * *',
    });
  });

  it('posts a token-protected inference request from the exact feature vector', async () => {
    const before = predictAi.calls.length;
    const client = harness.moduleRef.get(AiEngineClient);
    const result = await client.predict({
      symbol: SYMBOL,
      timeframe: 'H1',
      horizon: 60,
      featureVersion: env.FEATURE_VERSION,
      asOf: END.toISOString(),
      features: VECTOR,
    });
    expect(result).toMatchObject({
      symbol: SYMBOL,
      direction: 'LONG',
      probability: 0.78,
      confidence: 0.74,
      riskLevel: 'MEDIUM',
      modelVersion: 'p14-test-1.0.0',
    });
    expect(predictAi.calls).toHaveLength(before + 1);
    const call = predictAi.calls[predictAi.calls.length - 1];
    expect(call.url).toBe(`${configuration.app.aiUrl}/api/v1/ai/predict`);
    expect(call.init?.method).toBe('POST');
    const headers = call.init?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['X-Service-Token']).toBe(configuration.app.aiServiceToken);
    expect(call.body).toMatchObject({
      symbol: SYMBOL,
      timeframe: 'H1',
      horizon: 60,
      featureVersion: env.FEATURE_VERSION,
      asOf: END.toISOString(),
    });
    expect(call.body.features).toEqual(VECTOR);
  });

  it('persists the exact inputs and caches by model version', async () => {
    const engine = harness.moduleRef.get(PredictionEngineService);
    const before = predictAi.calls.length;
    const first = await engine.evaluate({ symbol: SYMBOL }, 'H1');
    expect(first.modelStatus).toBe('ACTIVE');
    expect(first.signalPolicy).toMatchObject({ weight: 1, block: false, reason: null });
    expect(first.prediction).toMatchObject({ probability: 0.78, direction: 'LONG' });
    expect(predictAi.calls).toHaveLength(before + 1);

    const rows = await harness.prisma.prediction.findMany({ where: { modelVersionId: versionId } });
    expect(rows).toHaveLength(1);
    predictionId = rows[0].id;
    expect(rows[0].featuresSnapshot).toMatchObject({
      symbol: SYMBOL,
      timeframe: 'H1',
      horizon: 60,
      modelVersion: 'p14-test-1.0.0',
      featureVersion: env.FEATURE_VERSION,
      asOf: END.toISOString(),
    });
    expect((rows[0].featuresSnapshot as { features: Record<string, number> }).features).toEqual(
      VECTOR,
    );

    const cachedBefore = predictAi.calls.length;
    await engine.evaluate({ symbol: SYMBOL }, 'H1');
    expect(predictAi.calls).toHaveLength(cachedBefore);
    expect(await harness.prisma.prediction.count({ where: { modelVersionId: versionId } })).toBe(1);
  });

  it('resolves outcomes from the feature timestamp only and recomputes accuracy', async () => {
    // The write time deliberately differs from the vector's `asOf`; the label
    // window must follow the snapshot, not the wall clock.
    await harness.prisma.prediction.update({
      where: { id: predictionId },
      data: { createdAt: new Date(END.getTime() + 10 * 60_000) },
    });
    const pair = await harness.prisma.currencyPair.findUniqueOrThrow({ where: { symbol: SYMBOL } });
    // Keep the resolution window deterministic: only the fixtures below exist.
    await harness.prisma.marketCandle.deleteMany({
      where: {
        pairId: pair.id,
        timeframe: 'H1',
        timestamp: {
          gte: new Date(END.getTime() - 3_600_000),
          lte: new Date(END.getTime() + 3_600_000),
        },
      },
    });
    await harness.prisma.marketCandle.createMany({
      data: [
        // Leakage bait: before the vector timestamp with an enormous close.
        {
          pairId: pair.id,
          timeframe: 'H1',
          timestamp: new Date(END.getTime() - 60_000),
          open: 1,
          high: 3,
          low: 1,
          close: 3,
          provider: 'p14-fixture',
        },
        // Reference close at the feature timestamp (P13's label basis).
        {
          pairId: pair.id,
          timeframe: 'H1',
          timestamp: END,
          open: 1,
          high: 1.001,
          low: 0.999,
          close: 1,
          provider: 'p14-fixture',
        },
        {
          pairId: pair.id,
          timeframe: 'H1',
          timestamp: new Date(END.getTime() + 10 * 60_000),
          open: 1.001,
          high: 1.002,
          low: 1,
          close: 1.001,
          provider: 'p14-fixture',
        },
        {
          pairId: pair.id,
          timeframe: 'H1',
          timestamp: new Date(END.getTime() + 20 * 60_000),
          open: 1.004,
          high: 1.005,
          low: 1.003,
          close: 1.004,
          provider: 'p14-fixture',
        },
      ],
      skipDuplicates: true,
    });

    const processor = harness.moduleRef.get(OutcomesProcessor);
    await (processor as unknown as { handle: Handle }).handle({ limit: 500 });

    const outcome = await harness.prisma.predictionOutcome.findUniqueOrThrow({
      where: { predictionId },
    });
    expect(outcome.label).toBe(1);
    expect(outcome.correct).toBe(true);
    // (1.004 - 1.0) / 1.0 * 100 = 0.4%: measured from the vector-time close,
    // ignoring both the pre-vector bait and the later wall-clock write time.
    expect(Number(outcome.actualMovePct)).toBe(0.4);
    expect(outcome.resolvedAt.toISOString()).toBe(
      new Date(END.getTime() + 3_600_000).toISOString(),
    );

    const version = await harness.prisma.modelVersion.findUniqueOrThrow({
      where: { id: versionId },
    });
    expect(version.metrics).toMatchObject({ liveAccuracy: 1, resolvedOutcomes: 1 });
  });

  it('mirrors the P13 label rule from the exact inputs it is given', () => {
    expect(resolveMove(1, [1.002], 0.3)).toEqual({ actualMovePct: 0.2, label: 0 });
    expect(resolveMove(1, [1.12, 1.11], 0.3).label).toBe(1);
    // A large down move is still label 0 — P13 is an up-move classifier.
    expect(resolveMove(1, [0.99, 0.98], 0.3)).toEqual({ actualMovePct: 0, label: 0 });
    expect(resolveMove(1, [], 0.3)).toEqual({ actualMovePct: 0, label: 0 });
    expect(labelStartOf({ asOf: END.toISOString() }, new Date(0))).toEqual(END);
    expect(labelStartOf({}, END)).toEqual(END);
  });

  it('warns loudly and blocks further trust when drift is detected', async () => {
    const events = harness.moduleRef.get(EventsService);
    const notify = jest.spyOn(events, 'notificationNew').mockImplementation(() => undefined);
    try {
      const processor = harness.moduleRef.get(DriftProcessor);
      await (processor as unknown as { handle: Handle }).handle({});

      const version = await harness.prisma.modelVersion.findUniqueOrThrow({
        where: { id: versionId },
      });
      expect(version.status).toBe('DRIFT_WARNING');
      const systemEvents = await harness.prisma.systemEvent.findMany({
        where: { code: 'model_performance_warning' },
      });
      expect(systemEvents.length).toBeGreaterThan(0);
      expect(systemEvents[0].level).toBe('WARN');
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0][0].notification).toMatchObject({
        type: 'MODEL_DRIFT',
        title: 'MODEL PERFORMANCE WARNING',
      });

      const policy = PredictionEngineService.policy('DRIFT_WARNING');
      expect(policy.block).toBe(false);
      expect(policy.weight).toBeGreaterThan(0);
      expect(policy.reason).toContain('MODEL PERFORMANCE WARNING');
    } finally {
      notify.mockRestore();
    }
  });

  it('exposes accuracy and drift status through the prepared admin surface', async () => {
    const admin = harness.moduleRef.get(
      (await import('../src/modules/admin/admin.service')).AdminService,
    ) as { predictionsPerformance(): Promise<{ items: Array<Record<string, unknown>> }> };
    const performance = await admin.predictionsPerformance();
    const item = performance.items.find((row) => row.modelVersion === 'xgboost-1.0.0');
    expect(item).toBeUndefined(); // the test model is named p14-test, not xgboost
    expect(
      performance.items.some(
        (row) => row.modelVersion === 'p14-test-1.0.0' && row.status === 'DRIFT_WARNING',
      ),
    ).toBe(true);
  });
});
