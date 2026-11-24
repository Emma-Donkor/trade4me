import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { config as loadDotenv } from 'dotenv';
import type { Timeframe } from '@ts/types';

/**
 * Deterministic two-year D1/H1 history for the seeded pairs. Deliberately
 * self-contained: this script runs through `tsx` and `prisma db seed`, so it
 * must not depend on application path aliases or Jest-only resolution rules.
 */

const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
  D1: 1_440,
  W1: 10_080,
  MN1: 43_200,
};
const HISTORY_TIMEFRAMES: readonly Timeframe[] = ['D1', 'H1'];
const PROVIDER_CANDLE_CHUNK = 500;
const INSERT_BATCH = 2_000;

/** Fixed end keeps the dataset byte-for-byte reproducible in CI. */
const DEFAULT_END = new Date('2026-11-24T00:00:00.000Z');

const REFERENCE_PRICES: Record<string, number> = {
  'EUR/USD': 1.085,
  'GBP/USD': 1.27,
  'USD/JPY': 148.5,
  'USD/CHF': 0.905,
  'AUD/USD': 0.665,
  'USD/CAD': 1.355,
  'NZD/USD': 0.605,
  'EUR/GBP': 0.855,
  'EUR/JPY': 161.2,
  'GBP/JPY': 188.4,
};

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function decimalsFor(pipSize: number): number {
  return Math.min(8, Math.ceil(-Math.log10(pipSize || 0.0001)) + 1);
}

function basePrice(symbol: string): number {
  return REFERENCE_PRICES[symbol] ?? 1 + (hash(symbol) % 40_000) / 10_000;
}

/** Same algorithm as the mock provider adapter: identical inputs, identical OHLC. */
function generateCandles(
  symbol: string,
  timeframe: Timeframe,
  start: Date,
  end: Date,
  pipSize: number,
): Array<{
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}> {
  const stepMs = TIMEFRAME_MINUTES[timeframe] * 60_000;
  const stepMinutes = TIMEFRAME_MINUTES[timeframe];
  const decimals = decimalsFor(pipSize);
  const candles: Array<{
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
  }> = [];
  const lastBucket = Math.floor(end.getTime() / stepMs);
  for (
    let bucket = Math.floor(start.getTime() / stepMs);
    bucket <= lastBucket && candles.length < PROVIDER_CANDLE_CHUNK;
    bucket += 1
  ) {
    const random = mulberry32(hash(`${symbol}:${bucket}:${stepMinutes}`));
    const open = roundTo(basePrice(symbol) * (1 + (random() - 0.5) * 0.004), decimals);
    const close = roundTo(open * (1 + (random() - 0.5) * 0.003), decimals);
    const wick = Math.max(10 ** -decimals, roundTo(open * 0.0004 * (0.5 + random()), decimals));
    candles.push({
      timestamp: new Date(bucket * stepMs),
      open,
      high: roundTo(Math.max(open, close) + wick, decimals),
      low: roundTo(Math.min(open, close) - wick, decimals),
      close,
    });
  }
  return candles;
}

export interface SeedHistoryOptions {
  years?: number;
  end?: Date;
  timeframes?: readonly Timeframe[];
  symbols?: readonly string[];
}

export interface SeedHistoryResult {
  pairs: number;
  timeframes: number;
  generated: number;
  inserted: number;
}

/** Composite-key dedupe makes replaying the seed safe and idempotent. */
export async function seedHistory(
  prisma: PrismaClient,
  options: SeedHistoryOptions = {},
): Promise<SeedHistoryResult> {
  const years = options.years ?? 2;
  const end =
    options.end ??
    (process.env.MARKET_SEED_HISTORY_END
      ? new Date(process.env.MARKET_SEED_HISTORY_END)
      : DEFAULT_END);
  if (Number.isNaN(end.getTime())) throw new Error('MARKET_SEED_HISTORY_END is not a valid date');
  const timeframes = options.timeframes ?? HISTORY_TIMEFRAMES;
  const pairs = await prisma.currencyPair.findMany({
    where: {
      isActive: true,
      ...(options.symbols ? { symbol: { in: [...options.symbols] } } : {}),
    },
    select: { id: true, symbol: true, pipSize: true },
    orderBy: { symbol: 'asc' },
  });

  let generated = 0;
  let inserted = 0;
  for (const pair of pairs) {
    const pipSize = Number(pair.pipSize);
    for (const timeframe of timeframes) {
      const stepMs = TIMEFRAME_MINUTES[timeframe] * 60_000;
      const from = new Date(end.getTime() - years * 365 * 86_400_000);
      const pending: Array<{
        pairId: string;
        timeframe: Timeframe;
        timestamp: Date;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number | null;
        provider: string;
      }> = [];
      const flush = async (): Promise<void> => {
        if (pending.length === 0) return;
        const result = await prisma.marketCandle.createMany({
          data: pending,
          skipDuplicates: true,
        });
        inserted += result.count;
        pending.length = 0;
      };

      for (
        let start = from.getTime();
        start <= end.getTime();
        start += PROVIDER_CANDLE_CHUNK * stepMs
      ) {
        const chunkEnd = Math.min(start + (PROVIDER_CANDLE_CHUNK - 1) * stepMs, end.getTime());
        for (const candle of generateCandles(
          pair.symbol,
          timeframe,
          new Date(start),
          new Date(chunkEnd),
          pipSize,
        )) {
          pending.push({
            pairId: pair.id,
            timeframe,
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: null,
            provider: 'mock',
          });
          generated += 1;
        }
        if (pending.length >= INSERT_BATCH) await flush();
      }
      await flush();
    }
  }

  return { pairs: pairs.length, timeframes: timeframes.length, generated, inserted };
}

async function main(): Promise<void> {
  loadDotenv({ path: resolve(process.cwd(), '.env.local') });
  const prisma = new PrismaClient();
  try {
    console.log('History seed complete:', JSON.stringify(await seedHistory(prisma)));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && /(?:^|[\\/])seed-history\.(?:ts|js)$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
