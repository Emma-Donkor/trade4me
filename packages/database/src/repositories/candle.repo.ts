import { Prisma, type Timeframe } from '@prisma/client';
import { BaseRepository, pageOf, pagination, type Page, type PaginationInput } from './base.repo';

/**
 * Explicit projection — README §7.4 forbids SELECT * on candle paths. This
 * select also defines the exact payload cached by later market-data phases.
 */
export const CANDLE_SELECT = {
  id: true,
  pairId: true,
  timeframe: true,
  timestamp: true,
  open: true,
  high: true,
  low: true,
  close: true,
  volume: true,
  provider: true,
} as const satisfies Prisma.MarketCandleSelect;

export type CandleRow = Prisma.MarketCandleGetPayload<{ select: typeof CANDLE_SELECT }>;

export interface CandleRangeInput extends PaginationInput {
  pairId: string;
  timeframe: Timeframe;
  from: Date;
  to: Date;
  order?: 'asc' | 'desc';
}

export interface CandleUpsertInput {
  pairId: string;
  timeframe: Timeframe;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  provider: string;
}

export class CandleRepository extends BaseRepository {
  async findByRange(input: CandleRangeInput): Promise<Page<CandleRow>> {
    const query = pagination(input);
    const where: Prisma.MarketCandleWhereInput = {
      pairId: input.pairId,
      timeframe: input.timeframe,
      timestamp: { gte: input.from, lte: input.to },
    };

    const [items, total] = await Promise.all([
      this.client.marketCandle.findMany({
        where,
        select: CANDLE_SELECT,
        orderBy: { timestamp: input.order ?? 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.client.marketCandle.count({ where }),
    ]);

    return pageOf(items, total, query);
  }

  /** Duplicate clock ticks are the same candle, not a second row. */
  async upsert(input: CandleUpsertInput): Promise<CandleRow> {
    const key = {
      pairId: input.pairId,
      timeframe: input.timeframe,
      timestamp: input.timestamp,
    };
    return this.client.marketCandle.upsert({
      where: { candle_pair_timeframe_timestamp_key: key },
      create: input,
      update: {
        open: input.open,
        high: input.high,
        low: input.low,
        close: input.close,
        volume: input.volume,
        provider: input.provider,
      },
      select: CANDLE_SELECT,
    });
  }
}
