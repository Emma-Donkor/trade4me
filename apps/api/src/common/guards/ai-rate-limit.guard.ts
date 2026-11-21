import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { AI_RATE_LIMIT_MAX, env } from '@ts/config';
import type { Request, Response } from 'express';
import { RedisService } from '../../modules/redis/redis.service';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/** README §8.5 + §19.3: /ai/* is capped per user at 20 requests per window. */
@Injectable()
export class AiRateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const path = request.originalUrl ?? request.path;
    if (!/^\/api\/v1\/ai(?:\/|$)/.test(path)) return true;

    const response = context.switchToHttp().getResponse<Response>();
    const identity = (request as Request & { user?: { id?: string } }).user?.id;
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    const windowSeconds = Math.max(1, Math.ceil(Number(env.RATE_LIMIT_WINDOW_MS) / 1000));
    const count = await this.redis.incrWithTtl(`rl:ai:${identity ?? ip}`, windowSeconds);

    response.setHeader('X-RateLimit-Limit', String(AI_RATE_LIMIT_MAX));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, AI_RATE_LIMIT_MAX - count)));
    if (count > AI_RATE_LIMIT_MAX) {
      response.setHeader('Retry-After', String(windowSeconds));
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'AI rate limit exceeded',
          details: { limit: AI_RATE_LIMIT_MAX, windowSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
