import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AI_RATE_LIMIT_MAX, env } from '@ts/config';
import type { Response } from 'express';
import { RedisService } from '../../modules/redis/redis.service';
import type { AuthenticatedRequest } from './jwt-auth.guard';

const LIMITED_PATH = /^\/api\/v1\/ai\/(assistant|explain)(?:\/|$)/;

/** README §8.5 + §19.3: /ai/assistant and /ai/explain are capped per user. */
@Injectable()
export class AiRateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const pathname = (request.originalUrl ?? request.path ?? '').split('?')[0];
    if (!LIMITED_PATH.test(pathname)) return true;

    // JwtAuthGuard runs before this guard, so a missing identity is a bug, not
    // a reason to fall back to a spoofable IP key.
    const userId = request.user?.id;
    if (!userId) throw new UnauthorizedException('AI endpoints require authentication');

    const response = context.switchToHttp().getResponse<Response>();
    const windowSeconds = Math.max(1, Math.ceil(Number(env.RATE_LIMIT_WINDOW_MS) / 1000));
    const count = await this.redis.incrWithTtl(`rl:ai:user:${userId}`, windowSeconds);

    response.setHeader('X-RateLimit-Limit', String(AI_RATE_LIMIT_MAX));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, AI_RATE_LIMIT_MAX - count)));
    response.setHeader('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + windowSeconds));
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
