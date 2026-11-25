import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { disconnect } from '@ts/database';
import type { Prisma } from '@ts/database';
import type { AssistantFact } from '@ts/validation';
import { seedHistory } from '../../../scripts/seed-history';
import { AiService } from '../src/modules/ai/ai.service';
import { AI_ENGINE_FETCH } from '../src/modules/technical-analysis/ai-engine.client';
import { fakeAiFetch } from './helpers/fake-ai';
import { accessTokenFor, createPhase7TestApp, type Phase7TestApp } from './helpers/test-app';

function bearer(token: string): string {
  return `Bearer ${token}`;
}

describe('P17 AI explanation engine integration', () => {
  let harness: Phase7TestApp;
  let token: string;
  let signalId: string | undefined;
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
    token = await accessTokenFor(harness);
    await seedHistory(harness.prisma, {
      symbols: ['EUR/USD', 'GBP/USD'],
      timeframes: ['H1', 'D1'],
      years: 0.1,
      end: new Date(),
    });
  }, 120_000);

  afterAll(async () => {
    if (signalId !== undefined) {
      await harness.prisma.aIAnalysis.deleteMany({ where: { subjectId: signalId } });
      await harness.prisma.tradeSignal.deleteMany({ where: { id: signalId } });
    }
    await harness?.close();
    await disconnect();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }, 120_000);

  it('returns the fully assembled assessment from /ai/assessment/:symbol', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/ai/assessment/EUR%2FUSD')
      .set('Authorization', bearer(token))
      .expect(200);

    expect(response.body.data).toMatchObject({
      symbol: 'EUR/USD',
      timeframe: 'H1',
      pendingPhases: ['P11', 'P12'],
      regime: { regime: expect.any(String) },
      technical: { symbol: 'EUR/USD' },
      historical: { symbol: 'EUR/USD' },
      modelStatus: expect.any(String),
      signalPolicy: expect.any(Object),
    });
    for (const field of ['news', 'risk', 'decision', 'explanation']) {
      expect(response.body.data).toHaveProperty(field);
    }
    expect(response.body.data.explanation).toMatchObject({
      decision: expect.any(String),
      supporting: expect.any(Array),
      contradicting: expect.any(Array),
      final: expect.any(String),
      probability: expect.any(Number),
      confidence: expect.any(Number),
      riskLevel: expect.any(String),
      dataFreshnessSeconds: expect.any(Number),
      modelVersion: expect.any(String),
      timestamp: expect.any(String),
      factors: expect.any(Array),
      summary: expect.any(String),
      explanationText: expect.any(String),
      explanationSource: expect.any(String),
      llmModel: expect.any(String),
      payloadHash: expect.any(String),
      validation: expect.any(Object),
    });
  });

  it('serves the same grounded layers from /analysis/:symbol', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/analysis/EUR%2FUSD')
      .set('Authorization', bearer(token))
      .expect(200);

    expect(response.body.data).toMatchObject({
      symbol: 'EUR/USD',
      explanation: { explanationText: expect.any(String), payloadHash: expect.any(String) },
    });
    for (const field of ['news', 'risk', 'decision']) {
      expect(response.body.data).toHaveProperty(field);
    }
  });

  it('returns a market report with scenarios labeled as probabilities summing to 100', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/analysis/EUR%2FUSD/report')
      .set('Authorization', bearer(token))
      .expect(200);

    const report = response.body.data;
    expect(report).toMatchObject({
      symbol: 'EUR/USD',
      summary: expect.any(String),
      trend: expect.any(String),
      decision: expect.any(String),
      warnings: expect.any(Array),
      generatedAt: expect.any(String),
      technicalEvidence: expect.any(Array),
      historicalEvidence: expect.any(Array),
      newsEvidence: expect.any(Array),
      reasons: expect.any(Array),
      explanationText: expect.any(String),
      explanationSource: expect.any(String),
      llmModel: expect.any(String),
      payloadHash: expect.any(String),
    });
    expect(report.scenarios).toHaveLength(3);
    expect(
      report.scenarios.reduce(
        (sum: number, item: { probability: number }) => sum + item.probability,
        0,
      ),
    ).toBe(100);
    expect(report.explanationText.toLowerCase()).toContain('probabilit');
    for (const scenario of report.scenarios) {
      expect(scenario).toMatchObject({
        label: expect.any(String),
        probability: expect.any(Number),
      });
      expect(report.explanationText).toContain(`${scenario.label} — ${scenario.probability}%`);
    }
  });

  it('explains a decision and persists an auditable AIAnalysis row', async () => {
    const pair = await harness.prisma.currencyPair.findUniqueOrThrow({
      where: { symbol: 'EUR/USD' },
    });
    signalId = `p17-${Date.now()}`;
    const scores: Prisma.InputJsonValue = {
      components: { technical: 82, historical: 71, news: 69, ml: 64, regime: 62, risk: 70 },
      supportingEvidence: [{ source: 'technical', claim: 'Positive momentum', value: 82 }],
      contradictingEvidence: [{ source: 'risk', claim: 'Elevated volatility', value: 1.2 }],
      regime: 'WEAK_UPTREND',
      modelVersion: 'xgboost-v1.4.2',
      dataFreshnessSeconds: 12,
      weightsVersion: 'v1',
    };
    await harness.prisma.tradeSignal.create({
      data: {
        id: signalId,
        pairId: pair.id,
        action: 'WATCH',
        score: 71.25,
        probability: 0.64,
        confidence: 0.72,
        riskLevel: 'MEDIUM',
        direction: 'LONG',
        riskReward: 2.1,
        scores,
        reasons: ['Positive momentum'],
        noTradeReasons: [],
        generatedAt: new Date(),
      },
    });

    const response = await request(harness.app.getHttpServer())
      .post('/api/v1/ai/explain')
      .set('Authorization', bearer(token))
      .send({ predictionId: signalId })
      .expect(201);

    expect(response.body.data).toMatchObject({
      predictionId: signalId,
      decision: 'WATCH',
      final: 'WATCH',
      probability: 64,
      confidence: 72,
      riskLevel: 'MEDIUM',
      dataFreshnessSeconds: 12,
      modelVersion: 'xgboost-v1.4.2',
      explanationSource: 'template',
      llmModel: expect.any(String),
      payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      validation: { valid: true, violations: [], attempts: 0 },
    });

    const row = await harness.prisma.aIAnalysis.findFirst({ where: { subjectId: signalId } });
    expect(row).not.toBeNull();
    expect(row).toMatchObject({
      subjectType: 'SIGNAL',
      summary: response.body.data.summary,
      explanationText: response.body.data.explanationText,
      llmModel: response.body.data.llmModel,
    });
    const supporting = row?.supportingEvidence as Record<string, unknown> | null;
    expect(supporting).toMatchObject({
      payloadHash: response.body.data.payloadHash,
      explanationSource: 'template',
    });
    expect(Array.isArray(supporting?.items)).toBe(true);
  });

  it('answers only from retrieved facts and says so when facts are absent', async () => {
    const service = harness.app.get(AiService);
    const retrieveFacts = jest
      .spyOn(
        service as unknown as {
          retrieveFacts(message: string): Promise<AssistantFact[]>;
        },
        'retrieveFacts',
      )
      .mockResolvedValue([]);

    try {
      const missing = await request(harness.app.getHttpServer())
        .post('/api/v1/ai/assistant')
        .set('Authorization', bearer(token))
        .send({ message: 'What changed in EUR/NZD?' })
        .expect(201);
      expect(missing.body.data).toMatchObject({
        answer: 'I do not have application data for that question yet.',
        sources: [],
        grounded: true,
        hasData: false,
      });

      const fact: AssistantFact = {
        kind: 'INDICATOR',
        symbol: 'EUR/USD',
        label: 'RSI14',
        value: '61.24',
        observedAt: new Date().toISOString(),
      };
      retrieveFacts.mockResolvedValue([fact]);
      const grounded = await request(harness.app.getHttpServer())
        .post('/api/v1/ai/assistant')
        .set('Authorization', bearer(token))
        .send({ message: 'What is RSI14 for EUR/USD?' })
        .expect(201);
      expect(grounded.body.data).toMatchObject({
        grounded: true,
        hasData: true,
        sources: [fact],
      });
      expect(grounded.body.data.answer).toContain('RSI14');
    } finally {
      retrieveFacts.mockRestore();
    }
  });
});
