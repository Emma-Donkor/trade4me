import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/** README §11.3 — feed/sentiment 5 min, calendar 15 min, no stale news. */
export const NEWS_FEED_TTL_SECONDS = 300;
export const NEWS_SENTIMENT_TTL_SECONDS = 300;
export const NEWS_EVENTS_TTL_SECONDS = 900;

@Injectable()
export class NewsCacheService {
  constructor(private readonly redis: RedisService) {}

  async read<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async write<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), ttlSeconds);
  }

  /** High-impact ingest invalidates every derived news view. */
  async invalidateAll(): Promise<void> {
    const keys = await this.redis.scanKeys('news:*');
    if (keys.length > 0) await this.redis.del(...keys);
  }

  async invalidateSentiment(symbol: string): Promise<void> {
    await this.redis.del(`news:sentiment:${symbol}`);
  }
}
