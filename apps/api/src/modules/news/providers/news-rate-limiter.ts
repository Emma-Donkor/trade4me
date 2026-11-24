import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { NewsProviderError } from './news-provider.interface';

const MAX_REQUESTS_PER_MINUTE = 60;
const WINDOW_SECONDS = 60;

/** Shared per-provider minute bucket so cron replays cannot hammer a feed. */
@Injectable()
export class NewsRateLimiter {
  constructor(private readonly redis: RedisService) {}

  async acquire(provider: string): Promise<void> {
    const count = await this.redis.incrWithTtl(`news:ratelimit:${provider}`, WINDOW_SECONDS);
    if (count > MAX_REQUESTS_PER_MINUTE) {
      throw new NewsProviderError(
        `provider ${provider} rate limit exceeded (${MAX_REQUESTS_PER_MINUTE}/min)`,
        provider,
        true,
      );
    }
  }
}
