import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { disconnect } from '@ts/database';
import { configuration } from '../src/config/configuration';
import { ModelEvalProcessor } from '../src/jobs/processors/model-eval.processor';
import { QUEUE_NAMES } from '../src/jobs/queues';
import { CRON_REGISTRATIONS } from '../src/jobs/schedulers';
import {
  AiEngineClient,
  AI_ENGINE_FETCH,
} from '../src/modules/technical-analysis/ai-engine.client';
import { fakeTrainFetch } from './helpers/fake-ai';
import { createPhase7TestApp, type Phase7TestApp } from './helpers/test-app';

describe('P13 ML pipeline wiring', () => {
  let harness: Phase7TestApp;
  const ai = fakeTrainFetch();
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
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
    await disconnect();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }, 120_000);

  it('wires the real model-eval processor and client', () => {
    expect(harness.moduleRef.get(ModelEvalProcessor)).toBeDefined();
    expect(harness.moduleRef.get(AiEngineClient)).toBeDefined();
  });

  it('registers the model-eval queue and a daily cron', () => {
    expect(QUEUE_NAMES).toContain('model-eval');
    const registration = CRON_REGISTRATIONS.find((item) => item.queue === 'model-eval');
    expect(registration).toBeDefined();
    expect(registration?.name).toBe('model-evaluation-daily');
    expect(registration?.pattern).toBe('0 5 * * *');
  });

  it('posts a token-protected train request to the internal AI route', async () => {
    const client = harness.moduleRef.get(AiEngineClient);
    const result = await client.train({
      horizon: '24h',
      threshold: 0.3,
      seed: 42,
      calibrationMethod: 'platt',
      walkForward: true,
      writeReport: false,
    });
    expect(result.selectedModel).toBe('xgboost');
    expect(result.xgboostGatePassed).toBe(true);
    expect(result.modelRuns).toBe(9);
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0].url).toBe(`${configuration.app.aiUrl}/api/v1/ai/ml/train`);
    expect(ai.calls[0].init?.method).toBe('POST');
    const headers = ai.calls[0].init?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['X-Service-Token']).toBe(configuration.app.aiServiceToken);
    expect(ai.calls[0].body).toMatchObject({
      horizon: '24h',
      threshold: 0.3,
      calibrationMethod: 'platt',
      walkForward: true,
    });
  });

  it('rejects a malformed training response before it can reach a worker', async () => {
    const malformed = fakeTrainFetch({ selectedModel: '' });
    const client = harness.moduleRef.get(AiEngineClient);
    const originalFetch = (client as unknown as { fetch: typeof ai.fetch }).fetch;
    (client as unknown as { fetch: typeof ai.fetch }).fetch = malformed.fetch;
    try {
      await expect(
        client.train({
          horizon: '24h',
          threshold: 0.3,
          seed: 42,
          calibrationMethod: 'platt',
          walkForward: true,
          writeReport: false,
        }),
      ).rejects.toThrow();
    } finally {
      (client as unknown as { fetch: typeof ai.fetch }).fetch = originalFetch;
    }
  });
});
