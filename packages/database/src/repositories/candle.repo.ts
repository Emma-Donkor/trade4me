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

/** Keyset cursor for deep history; offset scans degrade on large ranges. */
export interface CandleCursor {
  timestamp: Date;
  id: string;
}

export interface CandleSeriesInput extends Omit<CandleRangeInput, keyof PaginationInput> {
  limit: number;
  cursor?: CandleCursor;
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

  /**
   * P09 deep-history read: keyset pagination on the composite DESC index.
   * Takes one extra row so the caller can build a truthful `nextCursor`.
   */
  async findSeries(input: CandleSeriesInput): Promise<CandleRow[]> {
    const direction = input.order ?? 'desc';
    const cursorFilter: Prisma.MarketCandleWhereInput = input.cursor
      ? {
          OR: [
            {
              timestamp:
                direction === 'desc'
                  ? { lt: input.cursor.timestamp }
                  : { gt: input.cursor.timestamp },
            },
            {
              timestamp: input.cursor.timestamp,
              id: direction === 'desc' ? { lt: input.cursor.id } : { gt: input.cursor.id },
            },
          ],
        }
      : {};

    return this.client.marketCandle.findMany({
      where: {
        pairId: input.pairId,
        timeframe: input.timeframe,
        timestamp: { gte: input.from, lte: input.to },
        ...cursorFilter,
      },
      select: CANDLE_SELECT,
      orderBy: [{ timestamp: direction }, { id: direction }],
      // API callers are bounded by `candleRangeQuerySchema`; internal analysis
      // and integrity scans can request larger bounded series explicitly.
      take: Math.max(1, Math.min(50_000, Math.trunc(input.limit))) + 1,
    });
  }

  /**
   * Fast bounded scan for analysis/fixtures: raw SQL with float casts avoids
   * Prisma's per-Decimal allocation cost on >10k-row reads. Still an explicit
   * projection on the composite index — no SELECT * anywhere in this path.
   */
  async findSeriesFast(input: {
    pairId: string;
    timeframe: Timeframe;
    from: Date;
    to: Date;
    limit: number;
  }): Promise<
    Array<{
      timestamp: Date;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number | null;
      provider: string;
    }>
  > {
    return this.client.$queryRaw`
      SELECT "timestamp",
        "open"::float8 AS open, "high"::float8 AS high,
        "low"::float8 AS low, "close"::float8 AS close,
        "volume"::float8 AS volume, "provider"
      FROM "MarketCandle"
      WHERE "pairId" = ${input.pairId}
        AND "timeframe" = ${input.timeframe}::"Timeframe"
        AND "timestamp" >= ${input.from}
        AND "timestamp" <= ${input.to}
      ORDER BY "timestamp" ASC, "id" ASC
      LIMIT ${Math.max(1, Math.min(50_000, Math.trunc(input.limit)))}
    `;
  }

  /** Projected timestamp scan for the integrity job — no OHLC columns loaded. */
  async findTimestamps(input: {
    pairId: string;
    timeframe: Timeframe;
    from: Date;
    to: Date;
    after?: Date;
    limit?: number;
  }): Promise<Date[]> {
    const rows = await this.client.marketCandle.findMany({
      where: {
        pairId: input.pairId,
        timeframe: input.timeframe,
        timestamp: {
          gte: input.from,
          lte: input.to,
          ...(input.after ? { gt: input.after } : {}),
        },
      },
      select: { timestamp: true },
      orderBy: { timestamp: 'asc' },
      take: input.limit ?? 20_000,
    });
    return rows.map((row) => row.timestamp);
  }

  async latestTimestamp(pairId: string, timeframe: Timeframe): Promise<Date | null> {
    const row = await this.client.marketCandle.findFirst({
      where: { pairId, timeframe },
      select: { timestamp: true },
      orderBy: { timestamp: 'desc' },
    });
    return row?.timestamp ?? null;
  }

  async countInRange(pairId: string, timeframe: Timeframe, from: Date, to: Date): Promise<number> {
    return this.client.marketCandle.count({
      where: { pairId, timeframe, timestamp: { gte: from, lte: to } },
    });
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

  /**
   * Backfill/seed insert path: the unique key deduplicates replays, and an
   * existing candle is never overwritten with provider data on a re-import.
   */
  async upsertMany(inputs: readonly CandleUpsertInput[]): Promise<number> {
    if (inputs.length === 0) return 0;
    const result = await this.client.marketCandle.createMany({
      data: inputs as CandleUpsertInput[],
      skipDuplicates: true,
    });
    return result.count;
  }
}
