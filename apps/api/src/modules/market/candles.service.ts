import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CandleRepository, type CandleCursor, type CandleRow } from '@ts/database';
import type { CandleHistoryPage, CandleView, Timeframe } from '@ts/types';
import { z } from '@ts/validation';
import type { CandleRangeQuery } from '@ts/validation';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { candleCacheTtlSeconds } from './timeframes';

const candleViewSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  timestamp: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nullable(),
  provider: z.string(),
});
const cachedPageSchema = z.object({
  items: z.array(candleViewSchema),
  limit: z.number(),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  asOf: z.string(),
});
const cacheEntrySchema = z.object({ page: cachedPageSchema, cachedAt: z.string() });
const cursorSchema = z.object({ t: z.string(), i: z.string().min(1) });

/** Opaque keyset cursor: (timestamp, id) preserves stable order on ties. */
export function encodeCandleCursor(row: CandleRow): string {
  return Buffer.from(
    JSON.stringify({ t: row.timestamp.toISOString(), i: row.id }),
    'utf8',
  ).toString('base64url');
}

export function decodeCandleCursor(cursor: string): CandleCursor {
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown,
    );
    const timestamp = new Date(parsed.t);
    if (Number.isNaN(timestamp.getTime())) throw new Error('bad timestamp');
    return { timestamp, id: parsed.i };
  } catch {
    throw new BadRequestException({ code: 'BAD_REQUEST', message: 'Invalid cursor' });
  }
}

function view(row: CandleRow, symbol: string): CandleView {
  return {
    symbol,
    timeframe: row.timeframe,
    timestamp: row.timestamp.toISOString(),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: row.volume === null ? null : Number(row.volume),
    provider: row.provider,
  };
}

/** README §7.4/§7.5 — projected composite-index reads with a TTL'd cache. */
@Injectable()
export class CandleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: CandleRepository,
    private readonly redis: RedisService,
  ) {}

  private async pairOf(symbol: string): Promise<{ id: string; symbol: string }> {
    const pair = await this.prisma.getClient().currencyPair.findUnique({
      where: { symbol },
      select: { id: true, symbol: true },
    });
    if (!pair) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Unknown currency pair ${symbol}`,
        details: { symbol },
      });
    }
    return pair;
  }

  private cacheKey(input: {
    symbol: string;
    timeframe: Timeframe;
    from: Date;
    to: Date;
    limit: number;
    order: 'asc' | 'desc';
    cursor?: string;
  }): string {
    const fingerprint = createHash('sha1')
      .update(
        JSON.stringify([
          input.from.getTime(),
          input.to.getTime(),
          input.limit,
          input.order,
          input.cursor ?? null,
        ]),
      )
      .digest('base64url')
      .slice(0, 16);
    return `candles:${input.symbol}:${input.timeframe}:${fingerprint}`;
  }

  async query(query: CandleRangeQuery, now: Date = new Date()): Promise<CandleHistoryPage> {
    const from = new Date(query.start ?? (query.from as string));
    const to = new Date(query.end ?? (query.to as string));
    const limit = query.limit ?? query.pageSize ?? 50;
    const order = query.order ?? 'desc';
    const cursor = query.cursor;
    if (cursor) decodeCandleCursor(cursor); // fail fast before touching the cache

    const key = this.cacheKey({
      symbol: query.symbol,
      timeframe: query.timeframe,
      from,
      to,
      limit,
      order,
      cursor,
    });
    const cached = await this.redis.get(key);
    if (cached) {
      try {
        const parsed = cacheEntrySchema.parse(JSON.parse(cached) as unknown);
        return {
          ...parsed.page,
          items: parsed.page.items as unknown as CandleView[],
          source: 'cache',
        };
      } catch {
        await this.redis.del(key);
      }
    }

    const pair = await this.pairOf(query.symbol);
    const rows = await this.repository.findSeries({
      pairId: pair.id,
      timeframe: query.timeframe,
      from,
      to,
      limit,
      order,
      ...(cursor ? { cursor: decodeCandleCursor(cursor) } : {}),
    });
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const page: CandleHistoryPage = {
      items: pageRows.map((row) => view(row, pair.symbol)),
      limit,
      nextCursor: hasMore ? encodeCandleCursor(pageRows[pageRows.length - 1]) : null,
      hasMore,
      asOf: now.toISOString(),
      source: 'db',
    };
    await this.redis.set(
      key,
      JSON.stringify({ page, cachedAt: now.toISOString() }),
      candleCacheTtlSeconds(query.timeframe),
    );
    return page;
  }

  /** Bounded uncached series for aggregation/analysis consumers. */
  async series(
    symbol: string,
    timeframe: Timeframe,
    from: Date,
    to: Date,
    limit = 5_000,
  ): Promise<CandleView[]> {
    const pair = await this.pairOf(symbol);
    const rows = await this.repository.findSeriesFast({
      pairId: pair.id,
      timeframe,
      from,
      to,
      limit,
    });
    return rows.map((row) => ({
      symbol: pair.symbol,
      timeframe,
      timestamp: row.timestamp.toISOString(),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      provider: row.provider,
    }));
  }

  /**
   * P10: latest bounded window for indicator computation. Anchoring on stored
   * timestamps (not the request clock) keeps TA cache fingerprints stable
   * between identical calls.
   */
  async latestSeries(symbol: string, timeframe: Timeframe, limit: number): Promise<CandleView[]> {
    const pair = await this.pairOf(symbol);
    const rows = await this.repository.findSeries({
      pairId: pair.id,
      timeframe,
      from: new Date(0),
      to: new Date(),
      order: 'desc',
      limit: Math.max(1, Math.min(500, Math.trunc(limit))),
    });
    return rows
      .slice(0, Math.max(1, Math.min(500, Math.trunc(limit))))
      .reverse()
      .map((row) => view(row, pair.symbol));
  }
}
