import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { env } from '@ts/config';
import type { Request, Response } from 'express';
import { RedisService } from '../../redis/redis.service';

/** README §8.5: auth endpoints are limited to RATE_LIMIT_AUTH_MAX per window. */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    const windowSeconds = Math.ceil(Number(env.RATE_LIMIT_WINDOW_MS) / 1000);
    const count = await this.redis.incrWithTtl(`rl:auth:${ip}`, windowSeconds);
    response.setHeader('X-RateLimit-Limit', String(env.RATE_LIMIT_AUTH_MAX));

    if (count > Number(env.RATE_LIMIT_AUTH_MAX)) {
      response.setHeader('Retry-After', String(windowSeconds));
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' },
        429,
      );
    }
    return true;
  }
}
