import { Injectable } from '@nestjs/common';
import type { HistoryFreshnessView, Timeframe } from '@ts/types';
import { CandleRepository } from '@ts/database';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { HISTORY_TIMEFRAMES, timeframeStepMs } from './timeframes';

const CHECKPOINT_TTL_SECONDS = 24 * 60 * 60;
const LAST_SYNC_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * P09 resumable backfill checkpoints plus last-sync freshness. Redis is the
 * fast source; the newest stored candle is the durable fallback so a cold
 * Redis still reports an honest freshness after a seed or restart.
 */
@Injectable()
export class HistoryStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly candles: CandleRepository,
  ) {}

  private lastSyncKey(symbol: string, timeframe: Timeframe): string {
    return `history:lastsync:${symbol}:${timeframe}`;
  }

  private checkpointKey(symbol: string, timeframe: Timeframe, from: Date, to: Date): string {
    return `history:checkpoint:${symbol}:${timeframe}:${from.getTime()}:${to.getTime()}`;
  }

  async getLastSync(symbol: string, timeframe: Timeframe): Promise<Date | null> {
    const cached = await this.redis.get(this.lastSyncKey(symbol, timeframe));
    if (cached) {
      const date = new Date(cached);
      if (!Number.isNaN(date.getTime())) return date;
      await this.redis.del(this.lastSyncKey(symbol, timeframe));
    }
    const pair = await this.prisma.getClient().currencyPair.findUnique({
      where: { symbol },
      select: { id: true },
    });
    if (!pair) return null;
    return this.candles.latestTimestamp(pair.id, timeframe);
  }

  async markSynced(symbol: string, timeframe: Timeframe, at: Date = new Date()): Promise<void> {
    await this.redis.set(
      this.lastSyncKey(symbol, timeframe),
      at.toISOString(),
      LAST_SYNC_TTL_SECONDS,
    );
  }

  async getCheckpoint(
    symbol: string,
    timeframe: Timeframe,
    from: Date,
    to: Date,
  ): Promise<number | null> {
    const raw = await this.redis.get(this.checkpointKey(symbol, timeframe, from, to));
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  async setCheckpoint(
    symbol: string,
    timeframe: Timeframe,
    from: Date,
    to: Date,
    completedThroughMs: number,
  ): Promise<void> {
    await this.redis.set(
      this.checkpointKey(symbol, timeframe, from, to),
      String(completedThroughMs),
      CHECKPOINT_TTL_SECONDS,
    );
  }

  /** Two missed candle buckets is the honest tolerance for a late sync. */
  staleAfterMs(timeframe: Timeframe): number {
    return timeframeStepMs(timeframe) * 2;
  }

  async snapshot(now: Date = new Date()): Promise<HistoryFreshnessView> {
    const pairs = await this.prisma.getClient().currencyPair.findMany({
      where: { isActive: true },
      select: { symbol: true },
    });
    const byTimeframe: HistoryFreshnessView['byTimeframe'] = {};
    let globalOldest: number | null = null;
    let freshCount = 0;
    let staleCount = 0;

    for (const timeframe of HISTORY_TIMEFRAMES) {
      let timeframeOldest: Date | null = null;
      let timeframeFresh = 0;
      let timeframeStale = 0;
      for (const pair of pairs) {
        const lastSyncAt = await this.getLastSync(pair.symbol, timeframe);
        if (lastSyncAt && (!timeframeOldest || lastSyncAt < timeframeOldest)) {
          timeframeOldest = lastSyncAt;
        }
        const isStale =
          lastSyncAt === null ||
          now.getTime() - lastSyncAt.getTime() > this.staleAfterMs(timeframe);
        if (isStale) timeframeStale += 1;
        else timeframeFresh += 1;
      }
      freshCount += timeframeFresh;
      staleCount += timeframeStale;
      if (timeframeOldest) {
        const oldestMs = timeframeOldest.getTime();
        if (globalOldest === null || oldestMs < globalOldest) globalOldest = oldestMs;
      }
      byTimeframe[timeframe] = {
        lastSyncAt: timeframeOldest?.toISOString() ?? null,
        dataFreshnessSeconds:
          timeframeOldest === null
            ? null
            : Math.max(0, Math.floor((now.getTime() - timeframeOldest.getTime()) / 1_000)),
        isStale: timeframeFresh === 0 && pairs.length > 0,
      };
    }

    return {
      tracked: pairs.length * HISTORY_TIMEFRAMES.length,
      freshCount,
      staleCount,
      oldestSyncAt: globalOldest === null ? null : new Date(globalOldest).toISOString(),
      byTimeframe,
    };
  }
}
