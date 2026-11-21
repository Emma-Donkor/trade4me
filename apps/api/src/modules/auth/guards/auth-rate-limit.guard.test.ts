import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import { env } from '@ts/config';
import type { Request, Response } from 'express';
import { RedisService } from '../../redis/redis.service';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

describe('P06 AuthRateLimitGuard', () => {
  const mutableEnv = env as unknown as Record<string, unknown>;
  const originalMax = mutableEnv.RATE_LIMIT_AUTH_MAX;

  function context(ip: string, response: Response): ExecutionContext {
    const request = { ip, socket: { remoteAddress: ip } } as unknown as Request;
    return {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext;
  }

  afterEach(() => {
    mutableEnv.RATE_LIMIT_AUTH_MAX = originalMax;
  });

  it('allows requests under the limit and rejects with 429 above it', async () => {
    mutableEnv.RATE_LIMIT_AUTH_MAX = 2;
    let count = 0;
    const redis = {
      incrWithTtl: jest.fn(async () => ++count),
    } as unknown as RedisService;
    const setHeader = jest.fn();
    const guard = new AuthRateLimitGuard(redis);
    const ctx = context('203.0.113.1', { setHeader } as unknown as Response);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      status: 429,
      response: { code: 'RATE_LIMITED' },
    });
    expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });
});
