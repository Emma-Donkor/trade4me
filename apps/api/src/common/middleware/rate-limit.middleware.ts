import { Injectable, type NestMiddleware } from '@nestjs/common';
import { env } from '@ts/config';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { clientIp } from '../helpers/client-ip';
import { RedisService } from '../../modules/redis/redis.service';

type RateLimitedRequest = Request & { requestId?: string };

/**
 * README §8.5 global limiter: RATE_LIMIT_MAX requests per IP per window.
 * The response envelope matches HttpExceptionFilter because middleware runs
 * before Nest interceptors and exception filters.
 */
@Injectable()
export class GlobalRateLimitMiddleware implements NestMiddleware {
  constructor(private readonly redis: RedisService) {}

  async use(request: RateLimitedRequest, response: Response, next: NextFunction): Promise<void> {
    const ip = clientIp(request);
    const windowSeconds = Math.max(1, Math.ceil(Number(env.RATE_LIMIT_WINDOW_MS) / 1000));
    const resetAt = Math.floor(Date.now() / 1000) + windowSeconds;
    const limit = Math.max(1, Number(env.RATE_LIMIT_MAX));

    try {
      const count = await this.redis.incrWithTtl(`rl:global:${ip}`, windowSeconds);
      response.setHeader('X-RateLimit-Limit', String(limit));
      response.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
      response.setHeader('X-RateLimit-Reset', String(resetAt));

      if (count > limit) {
        response.setHeader('Retry-After', String(windowSeconds));
        const requestId = request.requestId ?? `req_${randomUUID()}`;
        request.requestId = requestId;
        response.setHeader('x-request-id', requestId);
        response.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests',
            details: { limit, windowSeconds },
            requestId,
          },
        });
        return;
      }
    } catch {
      // A Redis outage must not turn a rate-limiter failure into a 500 response.
    }

    next();
  }
}
