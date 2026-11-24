import { describe, expect, it, jest } from '@jest/globals';
import { RedisService } from '../../redis/redis.service';
import { ProviderError } from './provider.errors';
import { ProviderRateLimiter } from './provider-rate-limiter';

/** Mirrors the Lua bucket semantics so scheduling can be tested offline. */
function fakeRedis(): RedisService {
  const buckets = new Map<string, { tokens: number; updated: number }>();
  return {
    key: (...parts: string[]) => parts.join(':'),
    getClient: () => ({
      eval: jest.fn(
        async (
          _script: string,
          _numKeys: number,
          key: string,
          capacity: number,
          refillPerMs: number,
          now: number,
        ) => {
          const bucket = buckets.get(key) ?? { tokens: capacity, updated: now };
          bucket.tokens = Math.min(
            capacity,
            bucket.tokens + Math.max(0, now - bucket.updated) * refillPerMs,
          );
          bucket.updated = now;
          if (bucket.tokens < 1) return [0, 0, Math.ceil((1 - bucket.tokens) / refillPerMs)];
          bucket.tokens -= 1;
          buckets.set(key, bucket);
          return [1, bucket.tokens, 0];
        },
      ),
    }),
  } as unknown as RedisService;
}

describe('provider rate limiter', () => {
  it('allows N requests per minute and blocks the next one', async () => {
    let now = 1_000_000;
    const limiter = new ProviderRateLimiter(fakeRedis(), { capacity: 2, now: () => now });

    expect(await limiter.acquire('mock')).toMatchObject({ allowed: true, remaining: 1 });
    expect(await limiter.acquire('mock')).toMatchObject({ allowed: true, remaining: 0 });
    const blocked = await limiter.acquire('mock');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);

    // Two tokens per minute → one token is back after 30 seconds.
    now += 30_000;
    expect((await limiter.acquire('mock')).allowed).toBe(true);
  });

  it('default-equivalent capacity covers a full seeded-pair sync', async () => {
    // 60 is the documented default; the seed defines 10 active pairs.
    const limiter = new ProviderRateLimiter(fakeRedis(), { capacity: 60, now: () => 1_000_000 });
    for (let pair = 0; pair < 10; pair += 1) {
      expect((await limiter.acquire('mock')).allowed).toBe(true);
    }
  });

  it('keeps separate buckets per provider and throws a typed error', async () => {
    const limiter = new ProviderRateLimiter(fakeRedis(), { capacity: 1, now: () => 1_000_000 });
    expect((await limiter.acquire('primary')).allowed).toBe(true);
    expect((await limiter.acquire('backup')).allowed).toBe(true);
    await expect(limiter.assertAllowed('primary')).rejects.toMatchObject({
      kind: 'rate_limited',
      retryable: true,
    } as Partial<ProviderError>);
  });

  it('executes the real Redis Lua bucket (no JS stand-in)', async () => {
    const redis = new RedisService();
    const provider = `lua-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const limiter = new ProviderRateLimiter(redis, { capacity: 1, now: () => 1_700_000_000_000 });

    try {
      // The limiter uses the lazy client directly, so connect it first.
      await redis.ensureConnected();
      expect((await limiter.acquire(provider)).allowed).toBe(true);
      const blocked = await limiter.acquire(provider);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    } finally {
      await redis.getClient().del(redis.key('providers', 'ratelimit', provider));
      await redis.onModuleDestroy();
    }
  }, 30_000);
});
