import { Injectable, Optional } from '@nestjs/common';
import type { Candle, MarketQuote, ProviderHealth, Timeframe } from '@ts/types';
import type { Clock, MarketDataProvider, ProviderPairContext } from './provider.interface';

/** Keyless deterministic data: the same symbol + clock bucket always repeats. */
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

const TF_MINUTES: Record<Timeframe, number> = {
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

function decimalsFor(context?: ProviderPairContext): number {
  if (context?.quoteDecimals !== undefined) return context.quoteDecimals;
  if (context?.pipSize !== undefined) {
    return Math.min(8, Math.ceil(-Math.log10(context.pipSize)) + 1);
  }
  return 5;
}

function pipSizeFor(context?: ProviderPairContext): number {
  return context?.pipSize ?? 0.0001;
}

function basePrice(symbol: string): number {
  return REFERENCE_PRICES[symbol] ?? 1 + (hash(symbol) % 40_000) / 10_000;
}

function walk(symbol: string, bucket: number, steps: number): () => number {
  return mulberry32(hash(`${symbol}:${bucket}:${steps}`));
}

/** Synthetic, realistic OHLC with no API key and no hidden network calls. */
@Injectable()
export class MockProvider implements MarketDataProvider {
  readonly name = 'mock';
  private readonly clock: Clock;

  constructor(@Optional() clock?: Clock) {
    this.clock = clock ?? (() => new Date());
  }

  async getQuote(symbol: string, context?: ProviderPairContext): Promise<MarketQuote> {
    const now = this.clock();
    const bucket = Math.floor(now.getTime() / 60_000);
    const random = walk(symbol, bucket, 60);
    const decimals = decimalsFor(context);
    const pipSize = pipSizeFor(context);
    const typicalSpread = (context?.spreadPipsTypical ?? 1) * pipSize;

    let price = basePrice(symbol) * (1 + (random() - 0.5) * 0.002);
    for (let step = 0; step < 60; step += 1) {
      price *= 1 + (random() - 0.5) * 0.0001;
    }
    const mid = roundTo(price, decimals);
    const halfSpread = Math.max(10 ** -decimals / 2, roundTo(typicalSpread / 2, decimals));
    const bid = roundTo(mid - halfSpread, decimals);
    const ask = roundTo(mid + halfSpread, decimals);

    return {
      symbol,
      bid,
      ask,
      spread: roundTo(ask - bid, decimals),
      timestamp: new Date(Math.floor(now.getTime() / 1_000) * 1_000).toISOString(),
      provider: this.name,
    };
  }

  async getCandles(
    symbol: string,
    timeframe: Timeframe,
    start: Date,
    end: Date,
    context?: ProviderPairContext,
  ): Promise<Candle[]> {
    if (start.getTime() > end.getTime()) return [];
    const stepMs = TF_MINUTES[timeframe] * 60_000;
    const decimals = decimalsFor(context);
    const candles: Candle[] = [];
    const firstBucket = Math.floor(start.getTime() / stepMs);
    const lastBucket = Math.floor(end.getTime() / stepMs);
    for (let bucket = firstBucket; bucket <= lastBucket && candles.length < 500; bucket += 1) {
      const random = walk(symbol, bucket, TF_MINUTES[timeframe]);
      const open = roundTo(basePrice(symbol) * (1 + (random() - 0.5) * 0.004), decimals);
      const close = roundTo(open * (1 + (random() - 0.5) * 0.003), decimals);
      const wick = Math.max(10 ** -decimals, roundTo(open * 0.0004 * (0.5 + random()), decimals));
      const high = roundTo(Math.max(open, close) + wick, decimals);
      const low = roundTo(Math.min(open, close) - wick, decimals);
      candles.push({
        symbol,
        timeframe,
        timestamp: new Date(bucket * stepMs).toISOString(),
        open,
        high,
        low,
        close,
        volume: null,
        provider: this.name,
      });
    }
    return candles;
  }

  async getHealth(): Promise<ProviderHealth> {
    return {
      name: this.name,
      status: 'HEALTHY',
      lastCheckedAt: this.clock().toISOString(),
    };
  }
}
