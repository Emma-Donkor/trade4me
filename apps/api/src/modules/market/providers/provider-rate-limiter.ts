import { Injectable, Optional } from '@nestjs/common';
import { env } from '@ts/config';
import { RedisService } from '../../redis/redis.service';
import { ProviderError } from './provider.errors';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * One atomic Redis token bucket per provider. Capacity is
 * `MARKET_REQUESTS_PER_MINUTE` and tokens refill continuously over 60 seconds,
 * so a burst of N succeeds and the next call is rejected with a retry hint.
 */
const TOKEN_BUCKET_LUA = `
local state = redis.call('HMGET', KEYS[1], 'tokens', 'updated')
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local tokens = tonumber(state[1])
local updated = tonumber(state[2])
if tokens == nil or updated == nil then
  tokens = capacity
  updated = now
end
if now > updated then
  tokens = math.min(capacity, tokens + (now - updated) * refill)
end
local ttl = math.ceil(capacity / refill) + 1000
if tokens < 1 then
  redis.call('HSET', KEYS[1], 'tokens', tokens, 'updated', now)
  redis.call('PEXPIRE', KEYS[1], ttl)
  return {0, 0, math.ceil((1 - tokens) / refill)}
end
tokens = tokens - 1
redis.call('HSET', KEYS[1], 'tokens', tokens, 'updated', now)
redis.call('PEXPIRE', KEYS[1], ttl)
return {1, tokens, 0}
`;

@Injectable()
export class ProviderRateLimiter {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;

  constructor(
    private readonly redis: RedisService,
    @Optional() options: { capacity?: number; now?: () => number } = {},
  ) {
    this.capacity = Math.max(1, Math.trunc(options.capacity ?? env.MARKET_REQUESTS_PER_MINUTE));
    this.refillPerMs = this.capacity / 60_000;
    this.now = options.now ?? Date.now;
  }

  async acquire(name: string): Promise<RateLimitDecision> {
    const key = this.redis.key('providers', 'ratelimit', name);
    const reply = (await this.redis
      .getClient()
      .eval(TOKEN_BUCKET_LUA, 1, key, this.capacity, this.refillPerMs, this.now())) as unknown;
    const [allowed, remaining, retryAfterMs] = Array.isArray(reply) ? reply.map(Number) : [0, 0, 0];
    return {
      allowed: allowed === 1,
      remaining: Number.isFinite(remaining) ? remaining : 0,
      retryAfterMs: Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : 0,
    };
  }

  /** Throws the typed provider error the registry retries/fails over on. */
  async assertAllowed(name: string): Promise<void> {
    const decision = await this.acquire(name);
    if (!decision.allowed) {
      throw new ProviderError('rate_limited', `Rate limit reached for provider ${name}`, {
        retryAfterMs: decision.retryAfterMs,
        details: { provider: name, retryAfterMs: decision.retryAfterMs },
      });
    }
  }
}
