import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

function loadLocalFiles(): void {
  const cwd = process.cwd();
  const root = existsSync(join(cwd, '.env.local')) ? cwd : resolve(__dirname, '../../..');

  loadDotenv({ path: join(root, '.env.local') });
  loadDotenv({ path: join(root, '.env') });
}

loadLocalFiles();

/**
 * `z.coerce.boolean()` treats every non-empty string as `true`, including
 * `"false"`. Normalise the usual textual falsy/truthy values first so that
 * boolean environment variables behave as expected.
 */
const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== 'string') return value;

  const normalised = value.trim().toLowerCase();
  if (['false', '0', 'no', 'off', ''].includes(normalised)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalised)) return true;
  return value;
}, z.coerce.boolean());

/** Cron entries may carry inline ` # comment` suffixes (e.g. in .env.example). */
const cronExpression = z.preprocess(
  (value) => (typeof value === 'string' ? value.replace(/\s+#.*$/, '').trim() : value),
  z
    .string()
    .regex(/^\S+(?:\s+\S+){4}(?:\s+\S+)?$/, 'Expected a 5-field (or 6-field) cron expression'),
);

export const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  AI_PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  CORS_ORIGINS: z.string().min(1).default('http://localhost:3000'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  // Database / cache
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://tradesense:tradesense@localhost:5433/tradesense?schema=public'),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),
  REDIS_URL: z.string().min(1).default('redis://localhost:6380'),
  REDIS_PREFIX: z.string().min(1).default('tradesense:'),

  // Authentication & sessions
  JWT_SECRET: z.string().default(''),
  JWT_ACCESS_TTL: z.string().min(1).default('15m'),
  JWT_REFRESH_SECRET: z.string().default(''),
  JWT_REFRESH_TTL: z.string().min(1).default('7d'),
  REFRESH_COOKIE_NAME: z.string().min(1).default('ts_refresh'),
  REFRESH_COOKIE_SECURE: booleanFromEnv.default(true),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(31).default(12),
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(60),

  // Market data providers
  MARKET_DATA_PROVIDER: z.enum(['mock', 'alphavantage', 'twelvedata']).default('mock'),
  MARKET_API_KEY: z.string().default(''),
  MARKET_BACKUP_PROVIDER: z.string().min(1).default('twelvedata'),
  MARKET_BACKUP_API_KEY: z.string().default(''),
  MARKET_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(5),
  MARKET_DATA_STALE_THRESHOLD_SECONDS: z.coerce.number().int().positive().default(120),

  // News provider
  NEWS_PROVIDER: z.enum(['mock', 'newsapi', 'finnhub']).default('mock'),
  NEWS_API_KEY: z.string().default(''),
  NEWS_POLL_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),

  // Economic calendar provider
  ECONOMIC_CALENDAR_PROVIDER: z.string().min(1).default('mock'),
  ECONOMIC_CALENDAR_API_KEY: z.string().default(''),

  // LLM (explanations only — never raw trade decisions)
  AI_LLM_PROVIDER: z.string().min(1).default('openai'),
  AI_API_KEY: z.string().default(''),
  AI_LLM_MODEL: z.string().min(1).default('gpt-4o-mini'),
  AI_LLM_MAX_TOKENS: z.coerce.number().int().positive().default(700),
  AI_LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  // ML / model registry
  MODEL_REGISTRY_PATH: z.string().min(1).default('./models'),
  FEATURE_VERSION: z.string().min(1).default('v1.0'),
  DEFAULT_MODEL_NAME: z.string().min(1).default('xgboost'),
  DEFAULT_MODEL_VERSION: z.string().min(1).default('1.0.0'),
  PREDICTION_THRESHOLD: z.coerce.number().min(0).max(1).default(0.3),
  WALK_FORWARD_ENABLED: booleanFromEnv.default(true),

  // Background jobs
  MARKET_SYNC_CRON: cronExpression.default('0 * * * *'),
  NEWS_INGEST_CRON: cronExpression.default('*/15 * * * *'),
  FEATURE_JOB_CRON: cronExpression.default('*/30 * * * *'),
  OUTCOME_JOB_CRON: cronExpression.default('0 * * * *'),
  CLEANUP_CRON: cronExpression.default('0 3 * * *'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),

  // Risk engine defaults
  DEFAULT_RISK_PROFILE: z.enum(['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE']).default('MODERATE'),
  DEFAULT_RISK_PER_TRADE_PCT: z.coerce.number().positive().max(100).default(1),
  MAX_RISK_PER_TRADE_PCT: z.coerce.number().positive().max(100).default(2),
  MAX_OPEN_POSITIONS: z.coerce.number().int().positive().default(5),
  MAX_DAILY_LOSS_PCT: z.coerce.number().positive().max(100).default(3),
  MIN_RISK_REWARD_RATIO: z.coerce.number().positive().default(1.5),

  // Observability
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'verbose', 'debug', 'trace', 'silent'])
    .default('info'),
  ENABLE_REQUEST_IDS: booleanFromEnv.default(true),
  SENTRY_DSN: z.string().default(''),

  // Testing
  TEST_DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://tradesense:tradesense@localhost:5432/tradesense_test'),
  E2E_BASE_URL: z.string().url().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * The single entry point for reading process environment variables.
 * Production refuses to boot without signing secrets; development and test
 * may rely on the keyless local defaults.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${details.join('\n')}`);
  }

  if (parsed.data.NODE_ENV === 'production') {
    const missing = [
      ['JWT_SECRET', parsed.data.JWT_SECRET],
      ['JWT_REFRESH_SECRET', parsed.data.JWT_REFRESH_SECRET],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
    }
  }

  return parsed.data;
}

export const env: Env = loadEnv();
