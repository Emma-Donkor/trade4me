import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HealthService } from './health.service';

function dependency(status: 'up' | 'down') {
  return { status, latencyMs: 3, error: status === 'up' ? null : 'unreachable' } as const;
}

describe('HealthService', () => {
  const redis = { ping: jest.fn() } as unknown as RedisService;
  const prisma = { check: jest.fn() } as unknown as PrismaService;
  const service = new HealthService(redis, prisma);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports liveness without checking dependencies', () => {
    expect(service.liveness()).toEqual({ status: 'ok' });
  });

  it('reports ok when redis, database and AI are all up', async () => {
    jest.spyOn(redis, 'ping').mockResolvedValue(dependency('up'));
    jest.spyOn(prisma, 'check').mockResolvedValue(dependency('up'));
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    } as Response);

    await expect(service.readiness()).resolves.toEqual({
      status: 'ok',
      dependencies: {
        redis: dependency('up'),
        database: dependency('up'),
        ai: { status: 'up', latencyMs: expect.any(Number), error: null },
      },
    });
  });

  it('reports degraded with per-dependency detail when any dependency is down', async () => {
    jest.spyOn(redis, 'ping').mockResolvedValue(dependency('up'));
    jest.spyOn(prisma, 'check').mockResolvedValue(dependency('down'));
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('AI timeout'));

    const result = await service.readiness();

    expect(result.status).toBe('degraded');
    expect(result.dependencies.redis.status).toBe('up');
    expect(result.dependencies.database.status).toBe('down');
    expect(result.dependencies.ai).toMatchObject({
      status: 'down',
      error: expect.stringContaining('AI timeout'),
    });
  });
});
