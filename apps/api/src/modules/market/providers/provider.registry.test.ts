import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { env } from '@ts/config';
import type { Candle, MarketQuote, ProviderHealth } from '@ts/types';
import type { RedisService } from '../../redis/redis.service';
import type { SystemEventService } from '../system-event.service';
import { ProviderError } from './provider.errors';
import { ProviderHealthStore } from './provider.health';
import { ProviderRateLimiter } from './provider-rate-limiter';
import type { MarketDataProvider, ProviderPairContext } from './provider.interface';
import { ProviderRegistry } from './provider.registry';

const mutableEnv = env as unknown as Record<string, unknown>;
const originalPrimary = mutableEnv.MARKET_DATA_PROVIDER;
const originalBackup = mutableEnv.MARKET_BACKUP_PROVIDER;

function quote(provider: string): MarketQuote {
  return {
    symbol: 'EUR/USD',
    bid: 1.08,
    ask: 1.0801,
    spread: 0.0001,
    timestamp: new Date().toISOString(),
    provider,
  };
}

function fakeProvider(name: string, getQuote: () => Promise<MarketQuote>): MarketDataProvider {
  return {
    name,
    getQuote: jest.fn(getQuote),
    getCandles: jest.fn(async (): Promise<Candle[]> => []),
    getHealth: jest.fn(async (): Promise<ProviderHealth> => ({
      name,
      status: 'HEALTHY',
      lastCheckedAt: new Date().toISOString(),
    })),
  };
}

function fakeRedis(): RedisService {
  return {
    key: (...parts: string[]) => parts.join(':'),
    set: jest.fn(async () => undefined),
    getClient: () => ({
      eval: jest.fn(async () => [1, 9, 0]),
    }),
  } as unknown as RedisService;
}

describe('provider registry', () => {
  let registry: ProviderRegistry;
  let primary: MarketDataProvider;
  let backup: MarketDataProvider;
  let events: { providerFailure: jest.Mock; timestampRejected: jest.Mock };

  beforeAll(async () => {
    mutableEnv.MARKET_DATA_PROVIDER = 'fake-primary';
    mutableEnv.MARKET_BACKUP_PROVIDER = 'fake-backup';
    primary = fakeProvider('fake-primary', async () => quote('fake-primary'));
    backup = fakeProvider('fake-backup', async () => quote('fake-backup'));
    events = { providerFailure: jest.fn(), timestampRejected: jest.fn() };
    registry = new ProviderRegistry(
      [primary, backup],
      new ProviderHealthStore(fakeRedis()),
      new ProviderRateLimiter(fakeRedis(), { capacity: 20 }),
      events as unknown as SystemEventService,
      { warn: jest.fn(), log: jest.fn() } as never,
      { attemptsPerProvider: 1, sleep: async () => undefined },
    );
    await registry.onModuleInit();
  });

  afterAll(() => {
    mutableEnv.MARKET_DATA_PROVIDER = originalPrimary;
    mutableEnv.MARKET_BACKUP_PROVIDER = originalBackup;
  });

  it('uses the primary provider when it succeeds', async () => {
    const result = await registry.quote('EUR/USD', {} as ProviderPairContext);
    expect(result.provider).toBe('fake-primary');
    expect(backup.getQuote).not.toHaveBeenCalled();
  });

  it('fails over and records degraded health when the primary fails', async () => {
    (primary.getQuote as jest.Mock<() => Promise<MarketQuote>>).mockRejectedValueOnce(
      new ProviderError('timeout', 'primary timed out'),
    );
    const result = await registry.quote('EUR/USD');
    expect(result.provider).toBe('fake-backup');
    expect(registry.views()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'fake-primary', status: 'DEGRADED' }),
      ]),
    );
  });

  it('logs timestamp rejections with the real provider and reason', async () => {
    const futurePrimary = fakeProvider('fake-primary', async () => {
      throw new ProviderError('invalid_timestamp', 'Future timestamp from fake-primary', {
        details: { reason: 'future', provider: 'fake-primary' },
      });
    });
    const isolatedEvents = { providerFailure: jest.fn(), timestampRejected: jest.fn() };
    const isolated = new ProviderRegistry(
      [futurePrimary],
      new ProviderHealthStore(fakeRedis()),
      new ProviderRateLimiter(fakeRedis(), { capacity: 20 }),
      isolatedEvents as unknown as SystemEventService,
      { warn: jest.fn(), log: jest.fn() } as never,
      { attemptsPerProvider: 1, sleep: async () => undefined },
    );
    await isolated.onModuleInit();

    await expect(isolated.quote('EUR/USD')).rejects.toMatchObject({
      kind: 'unavailable',
    } as Partial<ProviderError>);
    expect(isolatedEvents.timestampRejected).toHaveBeenCalledWith(
      'fake-primary',
      'future',
      expect.objectContaining({ symbol: 'EUR/USD', operation: 'quote' }),
    );
  });

  it('reports MARKET_DATA_UNAVAILABLE and logs both failures when all providers fail', async () => {
    events.providerFailure.mockClear();
    (primary.getQuote as jest.Mock<() => Promise<MarketQuote>>).mockRejectedValue(
      new ProviderError('quota', 'quota'),
    );
    (backup.getQuote as jest.Mock<() => Promise<MarketQuote>>).mockRejectedValue(
      new ProviderError('http', 'bad gateway'),
    );
    await expect(registry.quote('EUR/USD')).rejects.toMatchObject({
      kind: 'unavailable',
    } as Partial<ProviderError>);
    expect(events.providerFailure).toHaveBeenCalledTimes(2);
  });
});
