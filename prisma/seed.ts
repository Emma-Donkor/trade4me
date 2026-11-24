import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { hash } from 'bcryptjs';
import { Prisma, PrismaClient, RiskProfileType } from '@prisma/client';

// Prisma CLI loads `.env`; this repository keeps local values in `.env.local`.
// Never override a DATABASE_URL supplied by the caller (e.g. `migrate reset`
// pointing at the test database).
loadDotenv({ path: resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

type PairSeed = {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  pipSize: number;
  pointValue: number;
  spreadPipsTypical: number;
};

/** The ten majors from the README reference-data model. */
const PAIRS: PairSeed[] = [
  {
    symbol: 'EUR/USD',
    baseCurrency: 'EUR',
    quoteCurrency: 'USD',
    pipSize: 0.0001,
    pointValue: 10,
    spreadPipsTypical: 1.0,
  },
  {
    symbol: 'GBP/USD',
    baseCurrency: 'GBP',
    quoteCurrency: 'USD',
    pipSize: 0.0001,
    pointValue: 10,
    spreadPipsTypical: 1.4,
  },
  {
    symbol: 'USD/JPY',
    baseCurrency: 'USD',
    quoteCurrency: 'JPY',
    pipSize: 0.01,
    pointValue: 9.09,
    spreadPipsTypical: 1.2,
  },
  {
    symbol: 'USD/CHF',
    baseCurrency: 'USD',
    quoteCurrency: 'CHF',
    pipSize: 0.0001,
    pointValue: 10,
    spreadPipsTypical: 1.5,
  },
  {
    symbol: 'AUD/USD',
    baseCurrency: 'AUD',
    quoteCurrency: 'USD',
    pipSize: 0.0001,
    pointValue: 10,
    spreadPipsTypical: 1.3,
  },
  {
    symbol: 'USD/CAD',
    baseCurrency: 'USD',
    quoteCurrency: 'CAD',
    pipSize: 0.0001,
    pointValue: 10,
    spreadPipsTypical: 1.5,
  },
  {
    symbol: 'NZD/USD',
    baseCurrency: 'NZD',
    quoteCurrency: 'USD',
    pipSize: 0.0001,
    pointValue: 10,
    spreadPipsTypical: 1.7,
  },
  {
    symbol: 'EUR/GBP',
    baseCurrency: 'EUR',
    quoteCurrency: 'GBP',
    pipSize: 0.0001,
    pointValue: 10,
    spreadPipsTypical: 1.6,
  },
  {
    symbol: 'EUR/JPY',
    baseCurrency: 'EUR',
    quoteCurrency: 'JPY',
    pipSize: 0.01,
    pointValue: 9.09,
    spreadPipsTypical: 1.8,
  },
  {
    symbol: 'GBP/JPY',
    baseCurrency: 'GBP',
    quoteCurrency: 'JPY',
    pipSize: 0.01,
    pointValue: 9.09,
    spreadPipsTypical: 2.2,
  },
];

/** README §14.3 profiles; the extra caps stay inside the configured hard limits. */
const RISK_PROFILES = [
  {
    name: 'Conservative',
    profileType: RiskProfileType.CONSERVATIVE,
    riskPerTradePct: 0.5,
    maxOpenPositions: 3,
    maxDailyLossPct: 1.5,
    minRiskReward: 2.0,
    maxPortfolioExposurePct: 10,
    maxDrawdownPct: 5,
    maxVolatilityPct: 15,
    newsEventRestriction: true,
  },
  {
    name: 'Moderate',
    profileType: RiskProfileType.MODERATE,
    riskPerTradePct: 1,
    maxOpenPositions: 5,
    maxDailyLossPct: 3,
    minRiskReward: 1.5,
    maxPortfolioExposurePct: 25,
    maxDrawdownPct: 10,
    maxVolatilityPct: 25,
    newsEventRestriction: true,
  },
  {
    name: 'Aggressive',
    profileType: RiskProfileType.AGGRESSIVE,
    riskPerTradePct: 2,
    maxOpenPositions: 8,
    maxDailyLossPct: 5,
    minRiskReward: 1.2,
    maxPortfolioExposurePct: 50,
    maxDrawdownPct: 20,
    maxVolatilityPct: 40,
    newsEventRestriction: false,
  },
] as const;

const DEMO_EMAIL = 'demo@tradesense.ai';
const ADMIN_EMAIL = 'admin@tradesense.ai';

function passwordFor(kind: 'DEMO' | 'ADMIN'): { value: string; fromEnv: boolean } {
  const fromEnv = process.env[`SEED_${kind}_PASSWORD`];
  return {
    value: fromEnv || randomBytes(12).toString('base64url'),
    fromEnv: Boolean(fromEnv),
  };
}

async function upsertUser(
  email: string,
  role: 'USER' | 'ADMIN',
  password: { value: string; fromEnv: boolean },
  bcryptRounds: number,
): Promise<{ created: boolean; password: string; fromEnv: boolean }> {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const passwordHash = await hash(password.value, bcryptRounds);
  const verifiedAt = new Date();

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        role,
        isActive: true,
        emailVerifiedAt: verifiedAt,
        // Only replace an existing password when explicitly supplied via env.
        ...(password.fromEnv ? { passwordHash } : {}),
      },
    });
  } else {
    await prisma.user.create({
      data: { email, passwordHash, role, emailVerifiedAt: verifiedAt, isActive: true },
    });
  }

  return { created: !existing, password: password.value, fromEnv: password.fromEnv };
}

async function main(): Promise<void> {
  const bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  if (!Number.isFinite(bcryptRounds) || bcryptRounds < 4 || bcryptRounds > 31) {
    throw new Error('BCRYPT_ROUNDS must be an integer between 4 and 31');
  }
  const rounds = Math.trunc(bcryptRounds);

  await prisma.currencyPair.createMany({
    data: PAIRS.map((pair) => ({
      ...pair,
      providerSymbols: {
        mock: pair.symbol,
        alphavantage: pair.symbol.replace('/', ''),
        twelvedata: pair.symbol.replace('/', ''),
      } satisfies Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });

  // Templates have no owner; unique(userId) still limits each user to one profile.
  for (const profile of RISK_PROFILES) {
    const existing = await prisma.riskProfile.findFirst({
      where: { name: profile.name, userId: null },
      select: { id: true },
    });
    if (!existing) await prisma.riskProfile.create({ data: { ...profile, userId: null } });
  }

  const name = process.env.DEFAULT_MODEL_NAME || 'xgboost';
  const version = process.env.DEFAULT_MODEL_VERSION || '1.0.0';
  const model = await prisma.modelVersion.upsert({
    where: { model_name_version_key: { name, version } },
    update: { status: 'ARCHIVED' },
    create: {
      name,
      version,
      featureVersion: process.env.FEATURE_VERSION || 'v1.0',
      trainingDatasetVersion: 'untrained-placeholder',
      hyperparams: {},
      metrics: {},
      status: 'ARCHIVED',
    },
  });

  const demo = await upsertUser(DEMO_EMAIL, 'USER', passwordFor('DEMO'), rounds);
  const admin = await upsertUser(ADMIN_EMAIL, 'ADMIN', passwordFor('ADMIN'), rounds);
  const demoUser = await prisma.user.findUniqueOrThrow({
    where: { email: DEMO_EMAIL },
    select: { id: true },
  });

  const watchlist = await prisma.watchlist.upsert({
    where: { watchlist_user_name_key: { userId: demoUser.id, name: 'Default' } },
    update: {},
    create: {
      name: 'Default',
      user: { connect: { email: DEMO_EMAIL } },
    },
  });

  const seededPairs = await prisma.currencyPair.findMany({
    where: { symbol: { in: PAIRS.slice(0, 5).map((pair) => pair.symbol) } },
    select: { id: true, symbol: true },
  });
  await prisma.watchlistItem.createMany({
    data: seededPairs.map((pair, index) => ({
      watchlistId: watchlist.id,
      pairId: pair.id,
      sortOrder: index,
      enabled: true,
    })),
    skipDuplicates: true,
  });

  // P09 — deterministic two-year D1/H1 history so technical analysis, ML and
  // backtesting have real data on a fresh install. Re-running is idempotent;
  // fast test resets can opt out with MARKET_SEED_HISTORY=0.
  if (process.env.MARKET_SEED_HISTORY !== '0') {
    const { seedHistory } = await import('../scripts/seed-history.js');
    const history = await seedHistory(prisma);
    console.log('History seed:', JSON.stringify(history));
  }

  const counts = {
    pairs: await prisma.currencyPair.count(),
    candles: await prisma.marketCandle.count(),
    riskProfiles: await prisma.riskProfile.count(),
    users: await prisma.user.count(),
    modelVersions: await prisma.modelVersion.count(),
    watchlistItems: await prisma.watchlistItem.count({ where: { watchlistId: watchlist.id } }),
  };

  const credentials = (
    label: string,
    email: string,
    result: Awaited<ReturnType<typeof upsertUser>>,
  ) => {
    const suffix = result.created
      ? ' (generated)'
      : result.fromEnv
        ? ' (from env, applied)'
        : ' (unchanged — use SEED_*_PASSWORD before reset to choose)';
    const password = result.created || result.fromEnv ? ` / ${result.password}` : ' / ********';
    console.log(`${label} ${email}${password}${suffix}`);
  };

  console.log('Seed complete:', JSON.stringify(counts));
  console.log(`Model placeholder: ${model.name}@${model.version} (ARCHIVED)`);
  credentials('Demo ', DEMO_EMAIL, demo);
  credentials('Admin', ADMIN_EMAIL, admin);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
