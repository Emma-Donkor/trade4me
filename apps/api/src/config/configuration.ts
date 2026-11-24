import { env } from '@ts/config';

function splitOrigins(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/** Typed view of validated environment values used at bootstrap. */
export const configuration = {
  app: {
    nodeEnv: String(env.NODE_ENV ?? 'development'),
    port: Number(env.API_PORT ?? 4000),
    aiUrl: String(env.AI_SERVICE_URL ?? 'http://localhost:8000').replace(/\/$/, ''),
    aiServiceToken: String(env.AI_SERVICE_TOKEN ?? 'tradesense-dev-service-token'),
  },
  cors: {
    origins: splitOrigins(env.CORS_ORIGINS ?? 'http://localhost:3000'),
  },
  trustProxy: Number(env.TRUST_PROXY ?? 1),
  redis: {
    url: String(env.REDIS_URL ?? 'redis://localhost:6379'),
    prefix: String(env.REDIS_PREFIX ?? 'tradesense:'),
  },
  auth: {
    accessTtl: String(env.JWT_ACCESS_TTL ?? '15m'),
    refreshTtl: String(env.JWT_REFRESH_TTL ?? '7d'),
  },
} as const;

export type Configuration = typeof configuration;
