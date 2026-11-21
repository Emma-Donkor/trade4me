import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { env } from '@ts/config';
import { PrismaClient } from '@ts/database';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
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
  return {
    ensureConnected: jest.fn(async () => undefined),
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    del: jest.fn(async (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) {
        if (values.delete(key)) removed += 1;
        if (sets.delete(key)) removed += 1;
      }
      return removed;
    }),
    exists: jest.fn(async (key: string) => values.has(key) || sets.has(key)),
    expire: jest.fn(async () => undefined),
    ttl: jest.fn(async () => 60),
    incrWithTtl: jest.fn(async (key: string) => {
      const next = Number(values.get(key) ?? 0) + 1;
      values.set(key, String(next));
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
    getClient: jest.fn(() => ({})),
    getPublisher: jest.fn(() => ({})),
    getSubscriber: jest.fn(() => ({})),
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
    BCRYPT_ROUNDS: '10',
    ENABLE_REQUEST_IDS: 'true',
  });
  const loggerSpy = jest.spyOn(JsonLogger.prototype, 'log').mockImplementation(() => undefined);
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
  const redis = memoryRedis();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({
      getClient: () => prisma,
      check: async () => ({ status: 'up', latencyMs: 1, error: null }),
      onModuleInit: async () => undefined,
      onModuleDestroy: async () => undefined,
    })
    .overrideProvider(RedisService)
    .useValue(redis)
    .compile();

  const app = moduleRef.createNestApplication();
  app.getHttpAdapter().getInstance().set('trust proxy', true);
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
