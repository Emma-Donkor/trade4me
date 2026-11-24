import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule, type TestingModuleBuilder } from '@nestjs/testing';
import { env } from '@ts/config';
import { PrismaClient } from '@ts/database';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { AppModule } from '../../src/app.module';
import { JsonLogger } from '../../src/common/logger/json-logger';
import { PrismaService } from '../../src/modules/prisma/prisma.service';
import { RedisService } from '../../src/modules/redis/redis.service';
import { TokenService } from '../../src/modules/auth/token.service';

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://tradesense:tradesense@localhost:5433/tradesense_test';

export interface MemoryRedis extends RedisService {
  snapshot(): Map<string, string>;
}

/** Deterministic Redis double shared by all Phase 7 integration fixtures. */
export function memoryRedis(): MemoryRedis {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const expiries = new Map<string, number>();
  const buckets = new Map<string, { tokens: number; updated: number }>();
  const purge = (key: string): void => {
    const expiresAt = expiries.get(key);
    if (expiresAt !== undefined && expiresAt <= Date.now()) {
      values.delete(key);
      expiries.delete(key);
    }
  };
  return {
    ensureConnected: jest.fn(async () => undefined),
    get: jest.fn(async (key: string) => {
      purge(key);
      return values.get(key) ?? null;
    }),
    getdel: jest.fn(async (key: string) => {
      purge(key);
      const value = values.get(key) ?? null;
      values.delete(key);
      expiries.delete(key);
      return value;
    }),
    consumeAndReplaceRefresh: jest.fn(
      async (
        oldKey: string,
        newKey: string,
        familyKey: string,
        input: {
          userId: string;
          familyId: string;
          sessionId: string;
          oldMember: string;
          replacement: string;
          newMember: string;
        },
      ) => {
        purge(oldKey);
        const stored = values.get(oldKey);
        if (!stored) return sets.has(familyKey) ? 'reuse' : 'revoked';
        const record = JSON.parse(stored) as {
          userId: string;
          familyId: string;
          sessionId: string;
        };
        if (
          record.userId !== input.userId ||
          record.familyId !== input.familyId ||
          record.sessionId !== input.sessionId
        ) {
          return 'mismatch';
        }
        values.delete(oldKey);
        expiries.delete(oldKey);
        sets.get(familyKey)?.delete(input.oldMember);
        values.set(newKey, input.replacement);
        const family = sets.get(familyKey) ?? new Set<string>();
        family.add(input.newMember);
        sets.set(familyKey, family);
        return 'rotated';
      },
    ),
    set: jest.fn(async (key: string, value: string, ttlSeconds?: number) => {
      values.set(key, value);
      if (ttlSeconds === undefined) expiries.delete(key);
      else expiries.set(key, Date.now() + Math.max(1, Math.ceil(ttlSeconds)) * 1000);
    }),
    del: jest.fn(async (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) {
        if (values.delete(key)) removed += 1;
        if (sets.delete(key)) removed += 1;
        expiries.delete(key);
      }
      return removed;
    }),
    exists: jest.fn(async (key: string) => {
      purge(key);
      return values.has(key) || sets.has(key);
    }),
    expire: jest.fn(async (key: string, ttlSeconds: number) => {
      expiries.set(key, Date.now() + Math.max(1, Math.ceil(ttlSeconds)) * 1000);
    }),
    ttl: jest.fn(async (key: string) => {
      purge(key);
      const expiresAt = expiries.get(key);
      if (expiresAt === undefined) return values.has(key) ? -1 : -2;
      return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    }),
    incrWithTtl: jest.fn(async (key: string, ttlSeconds: number) => {
      purge(key);
      const next = Number(values.get(key) ?? 0) + 1;
      values.set(key, String(next));
      expiries.set(key, Date.now() + Math.max(1, Math.ceil(ttlSeconds)) * 1000);
      return next;
    }),
    addToSet: jest.fn(async (key: string, ...members: string[]) => {
      const set = sets.get(key) ?? new Set<string>();
      members.forEach((member) => set.add(member));
      sets.set(key, set);
    }),
    removeFromSet: jest.fn(async (key: string, ...members: string[]) => {
      members.forEach((member) => sets.get(key)?.delete(member));
    }),
    membersOfSet: jest.fn(async (key: string) => [...(sets.get(key) ?? [])]),
    deleteSet: jest.fn(async (key: string) => {
      sets.delete(key);
    }),
    scanKeys: jest.fn(async (pattern: string) => {
      const prefix = pattern.replace('*', '');
      return [...values.keys()].filter((key) => key.startsWith(prefix));
    }),
    ping: jest.fn(async () => ({ status: 'up', latencyMs: 1, error: null })),
    onModuleDestroy: jest.fn(async () => undefined),
    // Minimal Redis EVAL stand-in for the provider token-bucket Lua script.
    getClient: jest.fn(() => ({
      eval: jest.fn(
        async (
          _script: string,
          _numKeys: number,
          key: string,
          capacity: number,
          refillPerMs: number,
          now: number,
        ) => {
          const bucket = buckets.get(key) ?? { tokens: capacity, updated: now };
          bucket.tokens = Math.min(
            capacity,
            bucket.tokens + Math.max(0, now - bucket.updated) * refillPerMs,
          );
          bucket.updated = now;
          if (bucket.tokens < 1) {
            const retryAfterMs = Math.ceil((1 - bucket.tokens) / refillPerMs);
            buckets.set(key, bucket);
            return [0, 0, retryAfterMs];
          }
          bucket.tokens -= 1;
          buckets.set(key, bucket);
          return [1, bucket.tokens, 0];
        },
      ),
    })),
    // RedisAdapter needs these channels when Socket.IO installs the adapter.
    getPublisher: jest.fn(() => ({ on: jest.fn(), publish: jest.fn() })),
    getSubscriber: jest.fn(() => ({
      on: jest.fn(),
      pSubscribe: jest.fn(),
      psubscribe: jest.fn(),
      subscribe: jest.fn(),
    })),
    key: jest.fn((...parts: string[]) => parts.join(':')),
    snapshot: () => values,
  } as unknown as MemoryRedis;
}

export interface Phase7TestApp {
  app: INestApplication;
  moduleRef: TestingModule;
  prisma: PrismaClient;
  redis: MemoryRedis;
  close(): Promise<void>;
}

export interface Phase7TestAppOptions {
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  marketRequestsPerMinute?: number;
  staleThresholdSeconds?: number;
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export async function createPhase7TestApp(
  options: Phase7TestAppOptions = {},
): Promise<Phase7TestApp> {
  const mutableEnv = env as unknown as Record<string, unknown>;
  const original = { ...mutableEnv };
  Object.assign(mutableEnv, {
    NODE_ENV: 'test',
    JWT_SECRET: 'phase7-access-secret',
    JWT_REFRESH_SECRET: 'phase7-refresh-secret',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    REFRESH_COOKIE_NAME: 'ts_refresh',
    REFRESH_COOKIE_SECURE: false,
    SESSION_IDLE_TIMEOUT_MINUTES: '60',
    RATE_LIMIT_WINDOW_MS: String(options.rateLimitWindowMs ?? 60_000),
    RATE_LIMIT_MAX: String(options.rateLimitMax ?? 1000),
    RATE_LIMIT_AUTH_MAX: '1000',
    MARKET_REQUESTS_PER_MINUTE: String(options.marketRequestsPerMinute ?? 100),
    MARKET_DATA_STALE_THRESHOLD_SECONDS: String(options.staleThresholdSeconds ?? 120),
    BCRYPT_ROUNDS: '10',
    ENABLE_REQUEST_IDS: 'true',
  });
  const loggerSpy = jest.spyOn(JsonLogger.prototype, 'log').mockImplementation(() => undefined);
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
  const redis = memoryRedis();

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({
      getClient: () => prisma,
      check: async () => ({ status: 'up', latencyMs: 1, error: null }),
      onModuleInit: async () => undefined,
      onModuleDestroy: async () => undefined,
    })
    .overrideProvider(RedisService)
    .useValue(redis);
  if (options.configure) builder = options.configure(builder);
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  // Match production: derive client IPs from the same trusted hop count.
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', Number(env.TRUST_PROXY ?? 1));
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  await app.init();

  return {
    app,
    moduleRef,
    prisma,
    redis,
    async close(): Promise<void> {
      await app.close();
      await prisma.$disconnect();
      loggerSpy.mockRestore();
      Object.assign(mutableEnv, original);
    },
  };
}

export async function accessTokenFor(
  harness: Phase7TestApp,
  role: 'USER' | 'ANALYST' | 'ADMIN' = 'USER',
): Promise<string> {
  const tokens = await harness.app.get(TokenService).createSession({
    id: `phase7-${role.toLowerCase()}-${randomUUID()}`,
    email: `${role.toLowerCase()}@phase7.test`,
    roles: [role],
  });
  return tokens.accessToken;
}
