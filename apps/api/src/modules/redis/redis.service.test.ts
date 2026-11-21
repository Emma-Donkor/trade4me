import { RedisService } from './redis.service';

describe('RedisService', () => {
  it('shuts down lazily connected clients without waiting for a connection', async () => {
    const service = new RedisService();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('pings and reconnects after an explicit disconnect', async () => {
    const service = new RedisService();
    let available = false;

    try {
      const first = await service.ping();
      if (first.status === 'down') {
        console.warn(`Redis unavailable; skipping reconnect test: ${String(first.error)}`);
        return;
      }
      available = true;
      expect(first).toEqual({ status: 'up', latencyMs: expect.any(Number), error: null });

      service.getClient().disconnect();
      const second = await service.ping();
      expect(second.status).toBe('up');
    } finally {
      if (available) await service.onModuleDestroy();
    }
  }, 30_000);
});
