import { describe, expect, it, jest } from '@jest/globals';
import type { Job } from 'bullmq';
import { JsonLogger } from '../../common/logger/json-logger';
import type { RedisService } from '../../modules/redis/redis.service';
import type { QuoteService } from '../../modules/market/quote.service';
import { MarketSyncProcessor, type MarketSyncJobData } from './market-sync.processor';

function fakeRedis(locks: Set<string>): RedisService {
  return {
    getClient: () => ({
      set: jest.fn(async (key: string, _value: string) => {
        if (locks.has(key)) return null;
        locks.add(key);
        return 'OK';
      }),
      del: jest.fn(async (key: string) => {
        locks.delete(key);
        return 1;
      }),
    }),
  } as unknown as RedisService;
}

function fakeJob(data: MarketSyncJobData): Job<MarketSyncJobData> {
  return {
    id: '42',
    name: 'market-sync-hourly',
    queueName: 'market-sync',
    data,
  } as unknown as Job<MarketSyncJobData>;
}

describe('MarketSyncProcessor', () => {
  it('fans out to QuoteService with the requested symbols', async () => {
    const locks = new Set<string>();
    const syncAll = jest.fn(async () => ({ updated: ['EUR/USD'], failed: [] as string[] }));
    const processor = new MarketSyncProcessor(new JsonLogger(), fakeRedis(locks), {
      syncAll,
    } as unknown as QuoteService);

    await processor.process(fakeJob({ symbols: ['EUR/USD'] }));

    expect(syncAll).toHaveBeenCalledWith(['EUR/USD']);
    expect(locks.size).toBe(0); // lock always released
  });

  it('skips a duplicate job while its lock is held', async () => {
    const locks = new Set(['market-sync:lock:market-sync-hourly:42']);
    const syncAll = jest.fn(async () => ({ updated: [] as string[], failed: [] as string[] }));
    const processor = new MarketSyncProcessor(new JsonLogger(), fakeRedis(locks), {
      syncAll,
    } as unknown as QuoteService);

    await processor.process(fakeJob({}));

    expect(syncAll).not.toHaveBeenCalled();
  });
});
