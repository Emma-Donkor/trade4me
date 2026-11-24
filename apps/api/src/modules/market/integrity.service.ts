import { Injectable } from '@nestjs/common';
import type { Timeframe } from '@ts/types';
import { PrismaService } from '../prisma/prisma.service';
import { BackfillService } from './backfill.service';
import type { CandleGap } from './gap-detector';
import { SystemEventService } from './system-event.service';
import { bucketStart, defaultLookbackMs, HISTORY_TIMEFRAMES, timeframeStepMs } from './timeframes';

export interface IntegrityResult {
  scanned: number;
  gaps: CandleGap[];
}

/** Daily history integrity scan: report holes, enqueue provider-only repair. */
@Injectable()
export class CandleIntegrityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backfill: BackfillService,
    private readonly events: SystemEventService,
  ) {}

  async scan(
    pair: { id: string; symbol: string },
    timeframe: Timeframe,
    from: Date,
    to: Date,
  ): Promise<CandleGap[]> {
    const gaps = await this.backfill.scanGaps(pair, timeframe, from, to);
    for (const gap of gaps) {
      await this.events.history('candle_gap_detected', {
        symbol: gap.symbol,
        timeframe: gap.timeframe,
        from: gap.from,
        to: gap.to,
        missing: gap.missing,
      });
    }
    return gaps;
  }

  async scanAll(now: Date = new Date()): Promise<IntegrityResult> {
    const pairs = await this.prisma.getClient().currencyPair.findMany({
      where: { isActive: true },
      select: { id: true, symbol: true },
    });
    const gaps: CandleGap[] = [];
    let scanned = 0;
    for (const timeframe of HISTORY_TIMEFRAMES) {
      const stepMs = timeframeStepMs(timeframe);
      const from = new Date(bucketStart(now.getTime() - 2 * defaultLookbackMs(timeframe), stepMs));
      const to = new Date(bucketStart(now.getTime(), stepMs));
      for (const pair of pairs) {
        gaps.push(...(await this.scan(pair, timeframe, from, to)));
        scanned += 1;
      }
    }
    return { scanned, gaps };
  }
}
