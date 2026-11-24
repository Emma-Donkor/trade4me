import { Injectable } from '@nestjs/common';
import { CandleRepository } from '@ts/database';
import type { Timeframe } from '@ts/types';
import { PrismaService } from '../prisma/prisma.service';
import { BackfillService } from './backfill.service';
import { HistoryStateService } from './history-state.service';
import { SystemEventService } from './system-event.service';
import { bucketStart, defaultLookbackMs, HISTORY_TIMEFRAMES, timeframeStepMs } from './timeframes';

export interface CandleSyncResult {
  updated: string[];
  failed: string[];
  written: number;
}

/** Hourly incremental sync: only fetch candle buckets newer than the last one stored. */
@Injectable()
export class CandleSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: CandleRepository,
    private readonly backfill: BackfillService,
    private readonly state: HistoryStateService,
    private readonly events: SystemEventService,
  ) {}

  async syncPair(
    symbol: string,
    timeframe: Timeframe,
    now: Date = new Date(),
  ): Promise<{ symbol: string; timeframe: Timeframe; written: number }> {
    const pair = await this.prisma.getClient().currencyPair.findUnique({
      where: { symbol },
      select: { id: true, symbol: true, isActive: true },
    });
    if (!pair || !pair.isActive) throw new Error(`Inactive or unknown pair ${symbol}`);

    const stepMs = timeframeStepMs(timeframe);
    const latest = await this.repository.latestTimestamp(pair.id, timeframe);
    const currentBucket = bucketStart(now.getTime(), stepMs);
    const from = latest
      ? new Date(latest.getTime() + stepMs)
      : new Date(currentBucket - defaultLookbackMs(timeframe));
    const to = new Date(currentBucket);

    if (from.getTime() > to.getTime()) {
      await this.state.markSynced(symbol, timeframe, now);
      return { symbol, timeframe, written: 0 };
    }

    try {
      const result = await this.backfill.run({ symbol, timeframe, from, to }, now);
      return { symbol, timeframe, written: result.written };
    } catch (error) {
      await this.events.history('history_incremental_failed', {
        symbol,
        timeframe,
        from: from.toISOString(),
        to: to.toISOString(),
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async syncAll(now: Date = new Date()): Promise<CandleSyncResult> {
    const pairs = await this.prisma.getClient().currencyPair.findMany({
      where: { isActive: true },
      select: { symbol: true },
    });
    const result: CandleSyncResult = { updated: [], failed: [], written: 0 };
    for (const pair of pairs) {
      for (const timeframe of HISTORY_TIMEFRAMES) {
        try {
          const synced = await this.syncPair(pair.symbol, timeframe, now);
          result.written += synced.written;
          if (!result.updated.includes(pair.symbol)) result.updated.push(pair.symbol);
        } catch {
          result.failed.push(`${pair.symbol}:${timeframe}`);
        }
      }
    }
    return result;
  }
}
