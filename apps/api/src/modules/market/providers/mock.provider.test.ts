import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decimalPlaces } from '@ts/validation';
import { MockProvider } from './mock.provider';

const NOW = new Date('2026-11-24T12:00:00.000Z');

describe('mock provider', () => {
  it('is deterministic, keyless and shaped like the recorded fixture', async () => {
    const one = new MockProvider(() => NOW);
    const two = new MockProvider(() => NOW);
    const quote = await one.getQuote('EUR/USD', {
      pipSize: 0.0001,
      spreadPipsTypical: 1,
    });
    expect(quote).toEqual(await two.getQuote('EUR/USD', { pipSize: 0.0001, spreadPipsTypical: 1 }));
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), 'tests/fixtures/providers/mock/quote.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(Object.keys(quote).sort()).toEqual(Object.keys(fixture).sort());
    expect(quote.provider).toBe('mock');
    expect(quote.ask).toBeGreaterThanOrEqual(quote.bid);
  });

  it('uses JPY precision for JPY pairs', async () => {
    const provider = new MockProvider(() => NOW);
    const quote = await provider.getQuote('USD/JPY', {
      pipSize: 0.01,
      spreadPipsTypical: 1.2,
      quoteDecimals: 3,
    });
    expect(decimalPlaces(quote.bid)).toBeLessThanOrEqual(3);
    expect(decimalPlaces(quote.ask)).toBeLessThanOrEqual(3);
    expect(quote.bid).toBeGreaterThan(100);
    expect(quote.spread).toBeGreaterThan(0);
  });

  it('generates consistent OHLC candles', async () => {
    const provider = new MockProvider(() => NOW);
    const candles = await provider.getCandles(
      'EUR/USD',
      'H1',
      new Date('2026-11-24T10:00:00Z'),
      new Date('2026-11-24T12:00:00Z'),
      { pipSize: 0.0001 },
    );
    expect(candles).toHaveLength(3);
    for (const candle of candles) {
      expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
      expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
    }
  });
});
