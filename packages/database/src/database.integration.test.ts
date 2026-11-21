import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { CandleRepository, QuoteRepository } from './index';

const ROOT = resolve(__dirname, '../..', '..');
const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://tradesense:tradesense@localhost:5433/tradesense_test';

// Repository singletons must point at the disposable test database, not the
// developer database that dotenv may have loaded into this Jest process.
process.env.DATABASE_URL = TEST_URL;

function resetTestDatabase(): void {
  try {
    // Invoke the CLI through node.exe directly: Windows `.cmd` shims cannot be
    // spawned by execFileSync without a shell.
    const prismaCli = resolve(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
    execFileSync(process.execPath, [prismaCli, 'migrate', 'reset', '--force', '--skip-generate'], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: TEST_URL },
      stdio: 'pipe',
      timeout: 180_000,
    });
  } catch (error) {
    const failure = error as { stderr?: Buffer };
    throw new Error(`migrate reset failed: ${String(failure.stderr?.toString() ?? error)}`);
  }
}

describe('database integration: migrate → seed → query', () => {
  let prisma: PrismaClient;
  let pairId: string;
  let userId: string;
  let modelVersionId: string;
  let predictionId: string;
  let cascadeUserId: string;

  beforeAll(async () => {
    resetTestDatabase();
    prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

    const pair = await prisma.currencyPair.findUniqueOrThrow({ where: { symbol: 'EUR/USD' } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'demo@tradesense.ai' } });
    const model = await prisma.modelVersion.findFirstOrThrow();
    pairId = pair.id;
    userId = user.id;
    modelVersionId = model.id;

    await new CandleRepository().upsert({
      pairId: pair.id,
      timeframe: 'H1',
      timestamp: new Date('2026-01-01T00:00:00Z'),
      open: 1.1,
      high: 1.12,
      low: 1.09,
      close: 1.11,
      provider: 'mock',
    });
    await new QuoteRepository().upsert({
      pairId: pair.id,
      bid: 1.1,
      ask: 1.1002,
      spread: 0.0002,
      timestamp: new Date('2026-01-01T00:00:00Z'),
      provider: 'mock',
    });

    const run = await prisma.modelRun.create({
      data: {
        modelVersionId: model.id,
        startedAt: new Date('2026-01-01T00:00:00Z'),
        finishedAt: new Date('2026-01-01T01:00:00Z'),
        trainRange: { from: '2025-01-01', to: '2025-12-31' },
        testRange: { from: '2026-01-01', to: '2026-01-31' },
        seed: 42,
        metrics: { accuracy: 0.61 },
      },
    });

    const prediction = await prisma.prediction.create({
      data: {
        pairId: pair.id,
        timeframe: 'H1',
        horizon: 4,
        modelVersionId: model.id,
        modelRunId: run.id,
        direction: 'LONG',
        probability: 0.62,
        confidence: 0.58,
        riskLevel: 'MEDIUM',
        featuresSnapshot: { rsi: 55 },
      },
    });
    predictionId = prediction.id;
    await prisma.predictionOutcome.create({
      data: {
        predictionId: prediction.id,
        resolvedAt: new Date('2026-01-02T00:00:00Z'),
        actualMovePct: 0.4,
        label: 1,
        correct: true,
      },
    });

    const signal = await prisma.tradeSignal.create({
      data: {
        pairId: pair.id,
        action: 'LONG',
        score: 82,
        probability: 0.62,
        confidence: 0.58,
        riskLevel: 'MEDIUM',
        direction: 'LONG',
        scores: { trend: 80, news: 70 },
        reasons: ['trend aligned'],
        noTradeReasons: [],
        generatedAt: new Date('2026-01-01T02:00:00Z'),
      },
    });
    await prisma.signalFeature.create({
      data: { signalId: signal.id, featureVersion: 'v1.0', values: { rsi: 55 } },
    });
    await prisma.aIAnalysis.create({
      data: {
        subjectType: 'SIGNAL',
        subjectId: signal.id,
        modelRunId: run.id,
        signalId: signal.id,
        summary: 'Momentum aligns with trend',
        supportingEvidence: { rsi: 55 },
        contradictingEvidence: {},
        explanationText: 'Trend and momentum agree.',
        llmModel: 'mock',
        timestamp: new Date('2026-01-01T02:05:00Z'),
      },
    });

    const article = await prisma.newsArticle.create({
      data: {
        source: 'mock',
        sourceUrl: 'https://example.test/news/1',
        title: 'Test headline',
        contentHash: 'integration-hash-1',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        currencies: ['EUR', 'USD'],
        rawText: 'Test body',
      },
    });
    await prisma.newsAnalysis.create({
      data: {
        articleId: article.id,
        eventType: 'MACRO',
        sentiment: 'BULLISH',
        impact: 'MEDIUM',
        confidence: 0.7,
        affectedPairs: ['EUR/USD'],
        analyzedBy: 'mock',
        analyzedAt: new Date('2026-01-01T00:10:00Z'),
      },
    });
    await prisma.economicEvent.create({
      data: {
        eventName: 'CPI',
        currency: 'USD',
        eventClass: 'inflation',
        scheduledAt: new Date('2026-01-03T12:00:00Z'),
        impact: 'HIGH',
      },
    });

    await prisma.technicalIndicator.create({
      data: {
        pairId: pair.id,
        timeframe: 'H1',
        timestamp: new Date('2026-01-01T00:00:00Z'),
        name: 'RSI',
        value: { value: 55 },
        computedAt: new Date('2026-01-01T00:01:00Z'),
      },
    });
    await prisma.marketFeature.create({
      data: {
        pairId: pair.id,
        timeframe: 'H1',
        timestamp: new Date('2026-01-01T00:00:00Z'),
        featureVersion: 'v1.0',
        values: { rsi: 55 },
      },
    });

    const backtest = await prisma.backtest.create({
      data: {
        userId: user.id,
        pairId: pair.id,
        strategy: 'trend',
        timeframe: 'H1',
        rangeStart: new Date('2025-01-01T00:00:00Z'),
        rangeEnd: new Date('2025-12-31T00:00:00Z'),
        startingCapital: 10000,
        riskPerTradePct: 1,
        status: 'COMPLETED',
        tradeCount: 1,
        results: { profitFactor: 1.4 },
      },
    });
    await prisma.backtestTrade.create({
      data: {
        backtestId: backtest.id,
        direction: 'LONG',
        entryAt: new Date('2025-06-01T00:00:00Z'),
        entryPrice: 1.1,
        exitAt: new Date('2025-06-01T04:00:00Z'),
        exitPrice: 1.12,
        size: 1000,
        pnl: 20,
        pnlPct: 0.2,
        reason: 'TAKE_PROFIT',
      },
    });

    const portfolio = await prisma.portfolio.create({
      data: { userId: user.id, name: 'Integration', balance: 10000, initialBalance: 10000 },
    });
    await prisma.position.create({
      data: {
        portfolioId: portfolio.id,
        pairId: pair.id,
        side: 'LONG',
        entryPrice: 1.1,
        size: 1000,
        stopLoss: 1.09,
        takeProfit: 1.12,
      },
    });
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'SIGNAL_CHANGED',
        title: 'Signal',
        body: 'Updated',
        payload: {},
      },
    });
    await prisma.auditLog.create({
      data: { userId: user.id, action: 'LOGIN', metadata: {}, requestId: 'req_integration' },
    });
    await prisma.systemEvent.create({
      data: { level: 'INFO', source: 'API', message: 'booted', code: 'BOOT', metadata: {} },
    });

    const cascadeUser = await prisma.user.create({
      data: { email: 'cascade@test.local', passwordHash: 'x', role: 'USER' },
    });
    cascadeUserId = cascadeUser.id;
    const cascadeWatchlist = await prisma.watchlist.create({
      data: { userId: cascadeUser.id, name: 'Cascade' },
    });
    await prisma.watchlistItem.create({
      data: { watchlistId: cascadeWatchlist.id, pairId: pair.id, sortOrder: 0 },
    });
    const cascadePortfolio = await prisma.portfolio.create({
      data: { userId: cascadeUser.id, name: 'Cascade' },
    });
    await prisma.position.create({
      data: {
        portfolioId: cascadePortfolio.id,
        pairId: pair.id,
        side: 'SHORT',
        entryPrice: 1.1,
        size: 100,
        stopLoss: 1.11,
        takeProfit: 1.08,
      },
    });
    await prisma.auditLog.create({
      data: { userId: cascadeUser.id, action: 'REGISTER', metadata: {}, requestId: 'req_cascade' },
    });
  }, 180_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('seeds the documented reference data and placeholder model', async () => {
    await expect(prisma.currencyPair.count()).resolves.toBe(10);
    // Only ownerless templates are reference data; a user-owned profile from
    // another integration fixture must not change this count.
    await expect(prisma.riskProfile.count({ where: { userId: null } })).resolves.toBe(3);
    await expect(prisma.user.count()).resolves.toBeGreaterThanOrEqual(2);

    const demo = await prisma.user.findUniqueOrThrow({
      where: { email: 'demo@tradesense.ai' },
      include: { watchlists: { include: { items: true } } },
    });
    expect(demo.role).toBe('USER');
    expect(demo.emailVerifiedAt).not.toBeNull();
    expect(demo.watchlists).toHaveLength(1);
    expect(demo.watchlists[0].items).toHaveLength(5);

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@tradesense.ai' } });
    expect(admin.role).toBe('ADMIN');

    const model = await prisma.modelVersion.findUniqueOrThrow({ where: { id: modelVersionId } });
    expect(model.status).toBe('ARCHIVED');
  });

  it('traverses every ERD relation cluster from README §6.2', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        profile: true,
        portfolios: { include: { positions: true } },
        watchlists: { include: { items: true } },
        notifications: true,
        auditLogs: true,
        backtests: { include: { trades: true } },
      },
    });
    expect(user.portfolios[0].positions).toHaveLength(1);
    expect(user.watchlists[0].items.length).toBeGreaterThan(0);
    expect(user.notifications).toHaveLength(1);
    expect(user.backtests[0].trades).toHaveLength(1);

    const pair = await prisma.currencyPair.findUniqueOrThrow({
      where: { id: pairId },
      include: {
        candles: true,
        quotes: true,
        indicators: true,
        features: true,
        predictions: { include: { outcome: true } },
        signals: { include: { features: true, analyses: true } },
        positions: true,
        watchlistItems: true,
        backtests: true,
      },
    });
    expect(pair.candles.length + pair.quotes.length).toBeGreaterThan(0);
    expect(pair.indicators).toHaveLength(1);
    expect(pair.features).toHaveLength(1);
    expect(pair.predictions[0].outcome?.correct).toBe(true);
    expect(pair.signals[0].features).toHaveLength(1);
    expect(pair.signals[0].analyses).toHaveLength(1);

    const model = await prisma.modelVersion.findUniqueOrThrow({
      where: { id: modelVersionId },
      include: { runs: { include: { predictions: true } } },
    });
    expect(model.runs[0].predictions).toHaveLength(1);

    const prediction = await prisma.prediction.findUniqueOrThrow({
      where: { id: predictionId },
      include: { outcome: true, pair: true, modelVersion: true, modelRun: true },
    });
    expect(prediction.outcome?.label).toBe(1);
    expect(prediction.pair.symbol).toBe('EUR/USD');

    const article = await prisma.newsArticle.findFirstOrThrow({ include: { analysis: true } });
    expect(article.analysis?.sentiment).toBe('BULLISH');
    await expect(prisma.economicEvent.count()).resolves.toBeGreaterThan(0);
    await expect(prisma.systemEvent.count()).resolves.toBeGreaterThan(0);
  });

  it('deduplicates candles on the unique (pair, timeframe, timestamp) key', async () => {
    const repository = new CandleRepository();
    const tick = {
      pairId,
      timeframe: 'H1' as const,
      timestamp: new Date('2026-02-01T00:00:00Z'),
      open: 1.1,
      high: 1.2,
      low: 1.05,
      close: 1.15,
      provider: 'mock',
    };
    await repository.upsert(tick);
    const updated = await repository.upsert({ ...tick, close: 1.18, volume: 100 });
    expect(updated.close.toNumber()).toBe(1.18);

    const rows = await prisma.marketCandle.findMany({
      where: { pairId, timeframe: 'H1', timestamp: tick.timestamp },
    });
    expect(rows).toHaveLength(1);
  });

  it('uses a composite (pair, timeframe, timestamp) index for candle ranges', async () => {
    const declared = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'MarketCandle' AND indexname = 'market_candle_range_idx'
    `;
    expect(declared).toHaveLength(1);

    await prisma.$transaction(async (tx) => {
      // A tiny fixture would normally prefer a sequential scan; disabling it
      // proves a composite index serves the exact range predicate. Postgres
      // may pick the equivalent unique b-tree (it scans backwards just as
      // well) instead of the explicitly declared DESC index.
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      const plan = await tx.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
        EXPLAIN SELECT "id" FROM "MarketCandle"
        WHERE "pairId" = ${pairId} AND "timeframe" = 'H1'
          AND "timestamp" BETWEEN ${new Date('2026-01-01T00:00:00Z')} AND ${new Date('2026-03-01T00:00:00Z')}
      `;
      const text = plan.map((row) => row['QUERY PLAN']).join('\n');
      expect(text).toContain('Index Scan');
      expect(text).toMatch(/market_candle_range_idx|MarketCandle_pairId_timeframe_timestamp_key/);
    });
  });

  it('cascades owned children and restricts deletion of referenced pairs', async () => {
    await prisma.user.delete({ where: { id: cascadeUserId } });
    await expect(prisma.watchlist.count({ where: { name: 'Cascade' } })).resolves.toBe(0);
    await expect(prisma.portfolio.count({ where: { name: 'Cascade' } })).resolves.toBe(0);
    // Audit records are retained by design: SetNull detaches the deleted user.
    const retained = await prisma.auditLog.findFirstOrThrow({
      where: { requestId: 'req_cascade' },
    });
    expect(retained.userId).toBeNull();

    await expect(prisma.currencyPair.delete({ where: { id: pairId } })).rejects.toThrow();
  });

  it('reproduces an identical database from db:reset with the same seed counts', async () => {
    resetTestDatabase();
    const fresh = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
    try {
      await expect(fresh.currencyPair.count()).resolves.toBe(10);
      await expect(fresh.riskProfile.count()).resolves.toBe(3);
      await expect(fresh.modelVersion.count()).resolves.toBe(1);
      await expect(fresh.watchlistItem.count()).resolves.toBe(5);
    } finally {
      await fresh.$disconnect();
    }
  }, 180_000);
});
