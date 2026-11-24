import { Injectable, Optional } from '@nestjs/common';
import type { Candle, MarketQuote, ProviderHealth, Timeframe } from '@ts/types';
import type { Clock, MarketDataProvider, ProviderPairContext } from './provider.interface';
import {
  basePriceFor,
  generateMockCandles,
  mockDecimals,
  pipSizeFor,
  roundTo,
  walk,
} from './mock-candles';

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
    const decimals = mockDecimals(context);
    const pipSize = pipSizeFor(context);
    const typicalSpread = (context?.spreadPipsTypical ?? 1) * pipSize;

    let price = basePriceFor(symbol) * (1 + (random() - 0.5) * 0.002);
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

  getCandles(
    symbol: string,
    timeframe: Timeframe,
    start: Date,
    end: Date,
    context?: ProviderPairContext,
  ): Promise<Candle[]> {
    return Promise.resolve(generateMockCandles(symbol, timeframe, start, end, context, this.name));
  }

  async getHealth(): Promise<ProviderHealth> {
    return {
      name: this.name,
      status: 'HEALTHY',
      lastCheckedAt: this.clock().toISOString(),
    };
  }
}
