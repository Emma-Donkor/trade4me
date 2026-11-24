import { describe, expect, it, jest } from '@jest/globals';
import type { Candle, Timeframe } from '@ts/types';
import { BackfillService } from './backfill.service';
import { HistoryStateService } from './history-state.service';
import { SystemEventService } from './system-event.service';
import type { ProviderRegistry } from './providers/provider.registry';
import { JsonLogger } from '../../common/logger/json-logger';

const pair = {
  id: 'pair-1',
  symbol: 'EUR/USD',
  pipSize: 0.0001,
  providerSymbols: {},
};

function candle(day: number, overrides: Partial<Candle> = {}): Candle {
  return {
    symbol: 'EUR/USD',
    timeframe: 'D1',
    timestamp: new Date(Date.UTC(2026, 0, 1 + day)).toISOString(),
    open: 1.1,
    high: 1.2,
    low: 1.05,
    close: 1.15,
    volume: null,
    provider: 'mock',
    ...overrides,
  };
}

/** In-memory stand-ins: the provider payload and the persisted rows are separate. */
function makeService(providerCandles: Candle[]) {
  const stored = new Map<number, number>(); // day → close (presence = stored row)
  const writes: number[] = [];
  const repository = {
    findTimestamps: jest.fn(async () =>
      [...stored.keys()].map((day) => new Date(Date.UTC(2026, 0, 1 + day))),
    ),
    upsertMany: jest.fn(async (rows: unknown[]) => {
      writes.push(rows.length);
      let inserted = 0;
      for (const row of rows as Array<{ timestamp: Date; close: number }>) {
        const day = Math.round((row.timestamp.getTime() - Date.UTC(2026, 0, 1)) / 86_400_000);
        if (!stored.has(day)) {
          stored.set(day, row.close);
          inserted += 1;
        }
      }
      return inserted;
    }),
  };
  const events = { history: jest.fn(async () => undefined) };
  const state = {
    getCheckpoint: jest.fn(async () => null),
    setCheckpoint: jest.fn(async () => undefined),
    markSynced: jest.fn(async () => undefined),
  };
  const prisma = {
    getClient: () => ({
      currencyPair: { findUnique: jest.fn(async () => pair) },
    }),
  };
  let call = 0;
  const registry = {
    candles: jest.fn(async () => {
      call += 1;
      return { value: [...providerCandles], provider: 'mock' };
    }),
  };
  const service = new BackfillService(
    prisma as never,
    repository as never,
    registry as unknown as ProviderRegistry,
    state as unknown as HistoryStateService,
    events as unknown as SystemEventService,
    { log: jest.fn() } as unknown as JsonLogger,
  );
  return { service, repository, events, state, writes, registry, calls: () => call };
}

const request = {
  symbol: 'EUR/USD',
  timeframe: 'D1' as Timeframe,
  from: new Date('2026-01-01T00:00:00.000Z'),
  to: new Date('2026-01-05T00:00:00.000Z'),
  now: new Date('2026-01-06T00:00:00.000Z'), // future "now" so mock timestamps are valid
};

describe('BackfillService', () => {
  it('writes a validated range and reports no gaps', async () => {
    const { service, repository } = makeService([
      candle(0),
      candle(1),
      candle(2),
      candle(3),
      candle(4),
    ]);
    const result = await service.run(request, request.now);
    expect(result.written).toBe(5);
    expect(result.gaps).toEqual([]);
    expect(repository.upsertMany).toHaveBeenCalled();
  });

  it('re-requests missing buckets from the provider instead of inventing rows', async () => {
    const full = [candle(0), candle(1), candle(2), candle(3), candle(4)];
    const partial = full.filter((row) => row !== full[2]);
    const harness = makeService(partial);
    let call = 0;
    harness.registry.candles.mockImplementation(async () => {
      call += 1;
      return { value: call === 1 ? partial : full, provider: 'mock' };
    });
    const result = await harness.service.run(request, request.now);
    expect(call).toBe(2);
    expect(result.repaired).toBe(1);
    expect(result.gaps).toEqual([]);
  });

  it('rejects a corrupt chunk atomically and logs it without writing rows', async () => {
    const harness = makeService([
      candle(0),
      candle(1, { high: 0.5, low: 2 }), // high < low: structurally invalid
      candle(2),
    ]);
    await expect(harness.service.run(request, request.now)).rejects.toThrow();
    expect(harness.repository.upsertMany).not.toHaveBeenCalled();
    expect(harness.events.history).toHaveBeenCalledWith(
      'history_chunk_rejected',
      expect.objectContaining({ reason: 'malformed' }),
      'ERROR',
    );
  });

  it('reports an unresolved gap as a SystemEvent when the provider never fills it', async () => {
    const harness = makeService([candle(0), candle(1), candle(3), candle(4)]);
    const result = await harness.service.run(request, request.now);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({
      from: '2026-01-03T00:00:00.000Z',
      to: '2026-01-03T00:00:00.000Z',
      missing: 1,
    });
    expect(harness.events.history).toHaveBeenCalledWith(
      'candle_gap_unresolved',
      expect.objectContaining({ missing: 1 }),
      'ERROR',
    );
  });
});
