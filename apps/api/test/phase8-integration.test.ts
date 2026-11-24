import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { env } from '@ts/config';
import type { Candle, MarketQuote, ProviderHealth } from '@ts/types';
import type {
  MarketDataProvider,
  ProviderPairContext,
} from '../src/modules/market/providers/provider.interface';
import { MARKET_PROVIDERS } from '../src/modules/market/providers/provider.interface';
import { ProviderError } from '../src/modules/market/providers/provider.errors';
import { EventsService } from '../src/modules/websocket/events.service';
import { accessTokenFor, createPhase7TestApp, type Phase7TestApp } from './helpers/test-app';

function bearer(token: string): string {
  return `Bearer ${token}`;
}

class ConfigurableProvider implements MarketDataProvider {
  failing = false;
  calls = 0;
  timestampOffsetMs = 0;
  lastContext: ProviderPairContext | undefined;

  constructor(
    readonly name: string,
    private readonly quoteTimestamp: () => Date = () => new Date(),
  ) {}

  async getQuote(symbol: string, context?: ProviderPairContext): Promise<MarketQuote> {
    this.calls += 1;
    this.lastContext = context;
    if (this.failing) throw new ProviderError('http', `${this.name} is down`);
    const price = 1.1 + this.calls / 10_000;
    return {
      symbol,
      bid: Number(price.toFixed(5)),
      ask: Number((price + 0.0001).toFixed(5)),
      spread: 0.0001,
      timestamp: new Date(this.quoteTimestamp().getTime() + this.timestampOffsetMs).toISOString(),
      provider: this.name,
    };
  }

  async getCandles(): Promise<Candle[]> {
    return [];
  }

  async getHealth(): Promise<ProviderHealth> {
    return { name: this.name, status: 'HEALTHY', lastCheckedAt: new Date().toISOString() };
  }
}

describe('P08 mock ingestion → DB → cache → API → WS', () => {
  let harness: Phase7TestApp;
  let token: string;
  let emitSpy: ReturnType<typeof jest.spyOn>;

  beforeAll(async () => {
    harness = await createPhase7TestApp({ marketRequestsPerMinute: 100 });
    token = await accessTokenFor(harness);
    emitSpy = jest.spyOn(harness.moduleRef.get(EventsService), 'quoteUpdate');
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  }, 120_000);

  it('persists a live quote, honours the cache TTL and returns freshness metadata', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/market/quote?symbols=EUR%2FUSD')
      .set('Authorization', bearer(token))
      .expect(200);

    expect(response.body.data.items).toEqual([
      expect.objectContaining({
        symbol: 'EUR/USD',
        provider: 'mock',
        source: 'live',
        isStale: false,
      }),
    ]);
    expect(response.body.data.items[0].dataFreshnessSeconds).toBeGreaterThanOrEqual(0);

    const stored = await harness.prisma.marketQuote.findFirst({
      where: { pair: { symbol: 'EUR/USD' } },
      select: { provider: true, bid: true, ask: true },
      orderBy: { timestamp: 'desc' },
    });
    expect(stored?.provider).toBe('mock');

    const cached = harness.redis.snapshot().get('quote:EUR/USD');
    expect(cached).toBeDefined();
    expect(JSON.parse(cached as string).quote).toMatchObject({
      symbol: 'EUR/USD',
      bid: stored ? Number(stored.bid) : 0,
    });
    const ttl = await harness.redis.ttl('quote:EUR/USD');
    expect(ttl).toBeGreaterThanOrEqual(30);
    expect(ttl).toBeLessThanOrEqual(120);
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'EUR/USD',
        bid: expect.any(Number),
        timestamp: expect.any(String),
      }),
    );

    const second = await request(harness.app.getHttpServer())
      .get('/api/v1/market/quote?symbols=EUR%2FUSD')
      .set('Authorization', bearer(token))
      .expect(200);
    expect(second.body.data.items[0].source).toBe('cache');
    expect(second.body.data.items[0].bid).toBe(response.body.data.items[0].bid);
  });

  it('returns a real aggregated overview with staleness flags', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/market/overview')
      .set('Authorization', bearer(token))
      .expect(200);
    expect(response.body.data).toMatchObject({
      totalPairs: 10,
      freshCount: expect.any(Number),
      staleCount: expect.any(Number),
      unavailableCount: expect.any(Number),
    });
    expect(response.body.data.quotes).toEqual(
      expect.arrayContaining([expect.objectContaining({ symbol: 'EUR/USD', isStale: false })]),
    );
    expect(response.body.data.byProvider.mock).toBeGreaterThanOrEqual(1);
  });

  it('publishes provider health for admins', async () => {
    const admin = await accessTokenFor(harness, 'ADMIN');
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/admin/providers')
      .set('Authorization', bearer(admin))
      .expect(200);
    expect(response.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'mock', role: 'primary', enabled: true }),
        expect.objectContaining({ name: 'twelvedata', role: 'backup' }),
      ]),
    );
  });
});

describe('P08 failover, all-fail and staleness', () => {
  let harness: Phase7TestApp;
  let token: string;
  const primary = new ConfigurableProvider('test-primary');
  const backup = new ConfigurableProvider('test-backup');
  const mutableEnv = env as unknown as Record<string, unknown>;
  const originalPrimary = mutableEnv.MARKET_DATA_PROVIDER;
  const originalBackup = mutableEnv.MARKET_BACKUP_PROVIDER;

  beforeAll(async () => {
    mutableEnv.MARKET_DATA_PROVIDER = primary.name;
    mutableEnv.MARKET_BACKUP_PROVIDER = backup.name;
    harness = await createPhase7TestApp({
      marketRequestsPerMinute: 100,
      staleThresholdSeconds: 5,
      configure: (builder) =>
        builder.overrideProvider(MARKET_PROVIDERS).useValue([primary, backup]),
    });
    token = await accessTokenFor(harness);
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
    mutableEnv.MARKET_DATA_PROVIDER = originalPrimary;
    mutableEnv.MARKET_BACKUP_PROVIDER = originalBackup;
  }, 120_000);

  it('passes the seeded providerSymbols mapping into the adapter context', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/market/quote?symbols=USD%2FJPY')
      .set('Authorization', bearer(token))
      .expect(200);
    expect(response.body.data.items[0].provider).toBe('test-primary');
    expect(primary.lastContext?.providerSymbols).toMatchObject({
      mock: 'USD/JPY',
      alphavantage: 'USDJPY',
      twelvedata: 'USDJPY',
    });
  });

  it('logs a timestamp_rejected SystemEvent when a provider sends a future stamp', async () => {
    primary.timestampOffsetMs = 60 * 60_000;
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/market/quote?symbols=USD%2FCAD')
      .set('Authorization', bearer(token))
      .expect(503);
    expect(response.body.error.code).toBe('MARKET_DATA_UNAVAILABLE');

    const event = await harness.prisma.systemEvent.findFirst({
      where: { code: 'timestamp_rejected:future' },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    });
    expect(event?.metadata).toMatchObject({
      provider: 'test-primary',
      reason: 'future',
      symbol: 'USD/CAD',
    });
    primary.timestampOffsetMs = 0;
  });

  it('fails over to the backup and records a provider SystemEvent', async () => {
    primary.failing = true;
    const before = await harness.prisma.systemEvent.count({ where: { source: 'PROVIDER' } });
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/market/quote?symbols=GBP%2FUSD')
      .set('Authorization', bearer(token))
      .expect(200);
    expect(response.body.data.items[0].provider).toBe('test-backup');
    const after = await harness.prisma.systemEvent.count({ where: { source: 'PROVIDER' } });
    expect(after).toBeGreaterThan(before);
  });

  it('returns MARKET_DATA_UNAVAILABLE when every provider fails', async () => {
    backup.failing = true;
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/market/quote?symbols=USD%2FCHF')
      .set('Authorization', bearer(token))
      .expect(503);
    expect(response.body.error.code).toBe('MARKET_DATA_UNAVAILABLE');
  });

  it('flags a frozen cached quote as stale instead of presenting it as live', async () => {
    const pair = await harness.prisma.currencyPair.findUnique({
      where: { symbol: 'AUD/USD' },
      select: { id: true },
    });
    expect(pair).not.toBeNull();
    const frozen = new Date(Date.now() - 60 * 60_000);
    const staleQuote = {
      symbol: 'AUD/USD',
      bid: 0.66,
      ask: 0.6601,
      spread: 0.0001,
      timestamp: frozen.toISOString(),
      provider: 'test-backup',
    };
    await harness.prisma.marketQuote.upsert({
      where: { quote_pair_timestamp_key: { pairId: pair!.id, timestamp: frozen } },
      create: {
        pairId: pair!.id,
        bid: staleQuote.bid,
        ask: staleQuote.ask,
        spread: staleQuote.spread,
        timestamp: frozen,
        provider: staleQuote.provider,
      },
      update: {},
    });
    await harness.redis.set(
      'quote:AUD/USD',
      JSON.stringify({ quote: staleQuote, cachedAt: frozen.toISOString() }),
      120,
    );

    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/market/quote?symbols=AUD%2FUSD')
      .set('Authorization', bearer(token))
      .expect(200);
    expect(response.body.data.items[0]).toMatchObject({
      isStale: true,
      source: 'cache',
      bid: 0.66,
    });
    expect(response.body.data.items[0].dataFreshnessSeconds).toBeGreaterThan(5);

    const strict = await request(harness.app.getHttpServer())
      .get('/api/v1/market/quote?symbols=AUD%2FUSD&freshOnly=true')
      .set('Authorization', bearer(token))
      .expect(422);
    expect(strict.body.error.code).toBe('MARKET_DATA_STALE');
    expect(strict.body.error.details).toMatchObject({ staleSymbols: ['AUD/USD'] });
  });
});
