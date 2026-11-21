import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { env } from '@ts/config';
import type { Request, Response } from 'express';
import { clientIp } from '../../../common/helpers/client-ip';
import { RedisService } from '../../redis/redis.service';

/** README §8.5: /auth/login and /auth/forgot-password are capped per endpoint. */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const endpoint = this.endpointOf(request);
    const ip = clientIp(request);
    const windowSeconds = Math.max(1, Math.ceil(Number(env.RATE_LIMIT_WINDOW_MS) / 1000));
    const max = Math.max(1, Number(env.RATE_LIMIT_AUTH_MAX));
    const count = await this.redis.incrWithTtl(`rl:auth:${endpoint}:${ip}`, windowSeconds);
    response.setHeader('X-RateLimit-Limit', String(max));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - count)));
    response.setHeader('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + windowSeconds));

    if (count > max) {
      response.setHeader('Retry-After', String(windowSeconds));
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' },
        429,
      );
    }
    return true;
  }

  private endpointOf(request: Request): string {
    const route = request.route?.path;
    if (typeof route === 'string' && route.length > 0) return route.replace(/^\//, '');
    const pathname = (request.originalUrl ?? request.path ?? '').split('?')[0];
    return pathname.split('/').filter(Boolean).at(-1) ?? 'unknown';
  }
}
