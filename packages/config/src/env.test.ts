import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { envSchema, loadEnv } from './env';

const ENV_NAMES = [
  'NODE_ENV',
  'NEXT_PUBLIC_APP_URL',
  'API_URL',
  'AI_SERVICE_URL',
  'AI_SERVICE_TOKEN',
  'API_PORT',
  'AI_PORT',
  'CORS_ORIGINS',
  'TRUST_PROXY',
  'DATABASE_URL',
  'DATABASE_POOL_SIZE',
  'REDIS_URL',
  'REDIS_PREFIX',
  'JWT_SECRET',
  'JWT_ACCESS_TTL',
  'JWT_REFRESH_SECRET',
  'JWT_REFRESH_TTL',
  'REFRESH_COOKIE_NAME',
  'REFRESH_COOKIE_SECURE',
  'BCRYPT_ROUNDS',
  'SESSION_IDLE_TIMEOUT_MINUTES',
  'MARKET_DATA_PROVIDER',
  'MARKET_API_KEY',
  'MARKET_BACKUP_PROVIDER',
  'MARKET_BACKUP_API_KEY',
  'MARKET_REQUESTS_PER_MINUTE',
  'MARKET_DATA_STALE_THRESHOLD_SECONDS',
  'NEWS_PROVIDER',
  'NEWS_API_KEY',
  'NEWS_POLL_INTERVAL_MINUTES',
  'ECONOMIC_CALENDAR_PROVIDER',
  'ECONOMIC_CALENDAR_API_KEY',
  'AI_LLM_PROVIDER',
  'AI_API_KEY',
  'AI_LLM_MODEL',
  'AI_LLM_MAX_TOKENS',
  'AI_LLM_TIMEOUT_MS',
  'MODEL_REGISTRY_PATH',
  'FEATURE_VERSION',
  'DEFAULT_MODEL_NAME',
  'DEFAULT_MODEL_VERSION',
  'PREDICTION_THRESHOLD',
  'WALK_FORWARD_ENABLED',
  'MARKET_SYNC_CRON',
  'MARKET_INTEGRITY_CRON',
  'NEWS_INGEST_CRON',
  'FEATURE_JOB_CRON',
  'OUTCOME_JOB_CRON',
  'CLEANUP_CRON',
  'RATE_LIMIT_WINDOW_MS',
  'RATE_LIMIT_MAX',
  'RATE_LIMIT_AUTH_MAX',
  'DEFAULT_RISK_PROFILE',
  'DEFAULT_RISK_PER_TRADE_PCT',
  'MAX_RISK_PER_TRADE_PCT',
  'MAX_OPEN_POSITIONS',
  'MAX_DAILY_LOSS_PCT',
  'MIN_RISK_REWARD_RATIO',
  'LOG_LEVEL',
  'ENABLE_REQUEST_IDS',
  'SENTRY_DSN',
  'TEST_DATABASE_URL',
  'E2E_BASE_URL',
];

describe('@ts/config', () => {
  it('covers every documented environment variable and nothing else', () => {
    expect(Object.keys(envSchema.shape).sort()).toEqual([...ENV_NAMES].sort());
  });

  it('documents the local env filename and data-tier ports consistently', () => {
    const example = readFileSync(resolve(__dirname, '../../../.env.example'), 'utf8');

    expect(example).toContain('Copy to .env.local');
    expect(example).toContain('DATABASE_URL=postgresql://tradesense:tradesense@localhost:5433/');
    expect(example).toContain('REDIS_URL=redis://localhost:6380');
    expect(example).toContain(
      'TEST_DATABASE_URL=postgresql://tradesense:tradesense@localhost:5433/',
    );
  });

  it('applies keyless development defaults', () => {
    const parsed = loadEnv({ NODE_ENV: 'development' });

    expect(parsed.API_PORT).toBe(4000);
    expect(parsed.AI_PORT).toBe(8000);
    expect(parsed.MARKET_DATA_PROVIDER).toBe('mock');
    // A full sync of the seeded pairs must fit the default keyless bucket.
    expect(parsed.MARKET_REQUESTS_PER_MINUTE).toBe(60);
    expect(parsed.JWT_SECRET).toBe('');
    expect(parsed.JWT_REFRESH_SECRET).toBe('');
    expect(parsed.AI_API_KEY).toBe('');
    expect(parsed.DATABASE_POOL_SIZE).toBe(10);
    expect(parsed.PREDICTION_THRESHOLD).toBe(0.3);
    expect(parsed.MARKET_SYNC_CRON).toBe('0 * * * *');
  });

  it('coerces numeric and boolean values', () => {
    const parsed = loadEnv({
      NODE_ENV: 'test',
      API_PORT: '4100',
      DATABASE_POOL_SIZE: '20',
      PREDICTION_THRESHOLD: '0.55',
      REFRESH_COOKIE_SECURE: 'false',
      WALK_FORWARD_ENABLED: 'false',
      ENABLE_REQUEST_IDS: '0',
    });

    expect(parsed.API_PORT).toBe(4100);
    expect(parsed.DATABASE_POOL_SIZE).toBe(20);
    expect(parsed.PREDICTION_THRESHOLD).toBe(0.55);
    expect(parsed.REFRESH_COOKIE_SECURE).toBe(false);
    expect(parsed.WALK_FORWARD_ENABLED).toBe(false);
    expect(parsed.ENABLE_REQUEST_IDS).toBe(false);
  });

  it('strips inline comments from cron values', () => {
    const parsed = loadEnv({
      NODE_ENV: 'test',
      MARKET_SYNC_CRON: '0 * * * *          # hourly candle sync',
      NEWS_INGEST_CRON: '*/15 * * * *       # every 15 minutes',
    });

    expect(parsed.MARKET_SYNC_CRON).toBe('0 * * * *');
    expect(parsed.NEWS_INGEST_CRON).toBe('*/15 * * * *');
  });

  it('refuses to boot in production without signing secrets', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(
      'Missing required production environment variables: JWT_SECRET, JWT_REFRESH_SECRET',
    );
  });

  it('boots in production once both signing secrets are present', () => {
    const parsed = loadEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'access-signing-secret',
      JWT_REFRESH_SECRET: 'refresh-signing-secret',
    });

    expect(parsed.NODE_ENV).toBe('production');
  });

  it('rejects malformed ports', () => {
    expect(() => loadEnv({ NODE_ENV: 'test', API_PORT: 'not-a-port' })).toThrow(
      'Invalid environment configuration',
    );
  });
});
