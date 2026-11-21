import { describe, expect, it } from '@jest/globals';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  it('shuts down lazily connected clients without waiting for a connection', async () => {
    const service = new RedisService();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('pings and reconnects after an explicit disconnect', async () => {
    const service = new RedisService();

    try {
      const first = await service.ping();
      expect(first).toEqual({ status: 'up', latencyMs: expect.any(Number), error: null });

      service.getClient().disconnect();
      const second = await service.ping();
      expect(second.status).toBe('up');
    } finally {
      await service.onModuleDestroy();
    }
  }, 30_000);

  it('consumes a value exactly once with GETDEL', async () => {
    const service = new RedisService();
    const key = `test:getdel:${Date.now()}`;

    try {
      await service.set(key, 'single-use', 30);
      expect(await service.getdel(key)).toBe('single-use');
      expect(await service.getdel(key)).toBeNull();
    } finally {
      await service.del(key);
      await service.onModuleDestroy();
    }
  }, 30_000);
});
