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

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  AI_PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  CORS_ORIGINS: z.string().min(1).default('http://localhost:3000'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://tradesense:tradesense@localhost:5433/tradesense?schema=public'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6380'),
  JWT_SECRET: z.string().min(1).optional(),
  JWT_REFRESH_SECRET: z.string().min(1).optional(),
  MARKET_DATA_PROVIDER: z.enum(['mock', 'alphavantage', 'twelvedata']).default('mock'),
  NEWS_PROVIDER: z.enum(['mock', 'newsapi', 'finnhub']).default('mock'),
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
