import { Injectable, NotFoundException } from '@nestjs/common';
import { CandleRepository, type CandleUpsertInput } from '@ts/database';
import type { Candle, Timeframe } from '@ts/types';
import { JsonLogger } from '../../common/logger/json-logger';
import { PrismaService } from '../prisma/prisma.service';
import { detectCandleGaps, type CandleGap } from './gap-detector';
import { HistoryStateService } from './history-state.service';
import { symbolsOf } from './quote.service';
import { SystemEventService } from './system-event.service';
import { ProviderError } from './providers/provider.errors';
import type { ProviderPairContext } from './providers/provider.interface';
import { ProviderRegistry } from './providers/provider.registry';
import { normalizeCandle } from './providers/response-validation';
import { PROVIDER_CANDLE_CHUNK, bucketStart, timeframeStepMs } from './timeframes';

export interface BackfillRequest {
  symbol: string;
  timeframe: Timeframe;
  from: Date;
  to: Date;
  /** Resume from the last completed chunk for this exact range. */
  resume?: boolean;
}

export interface BackfillResult {
  symbol: string;
  timeframe: Timeframe;
  from: string;
  to: string;
  written: number;
  chunks: number;
  repaired: number;
  gaps: CandleGap[];
}

interface PairInfo {
  id: string;
  symbol: string;
  pipSize: number;
  providerSymbols: Record<string, unknown>;
}

/**
 * Chunked, resumable, provider-only history import. Every chunk is fully
 * validated before it is written; holes are reported and re-requested from a
 * provider, never interpolated or forward-filled.
 */
@Injectable()
export class BackfillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: CandleRepository,
    private readonly registry: ProviderRegistry,
    private readonly state: HistoryStateService,
    private readonly events: SystemEventService,
    private readonly logger: JsonLogger,
  ) {}

  private async pairOf(symbol: string): Promise<PairInfo> {
    const pair = await this.prisma.getClient().currencyPair.findUnique({
      where: { symbol },
      select: { id: true, symbol: true, pipSize: true, providerSymbols: true },
    });
    if (!pair) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Unknown currency pair ${symbol}`,
        details: { symbol },
      });
    }
    return {
      id: pair.id,
      symbol: pair.symbol,
      pipSize: Number(pair.pipSize),
      providerSymbols: symbolsOf(pair.providerSymbols),
    };
  }

  private contextOf(pair: PairInfo): ProviderPairContext {
    return {
      pairId: pair.id,
      pipSize: pair.pipSize,
      providerSymbols: pair.providerSymbols,
    };
  }

  /** Validates the whole chunk first; a single bad row rejects all of it. */
  private async ingestChunk(
    pair: PairInfo,
    timeframe: Timeframe,
    start: Date,
    end: Date,
    now: Date,
  ): Promise<CandleUpsertInput[]> {
    const stepMs = timeframeStepMs(timeframe);
    const result = await this.registry.candles(
      pair.symbol,
      timeframe,
      start,
      end,
      this.contextOf(pair),
    );
    const rows: CandleUpsertInput[] = [];
    let previous: Date | null = null;
    try {
      for (const raw of result.value as unknown[]) {
        const candle: Candle = normalizeCandle(raw, pair.symbol, timeframe, result.provider, {
          now,
          previous,
          context: this.contextOf(pair),
        });
        const timestamp = new Date(candle.timestamp);
        previous = timestamp;
        if (timestamp.getTime() < start.getTime() || timestamp.getTime() > end.getTime()) continue;
        if (timestamp.getTime() % stepMs !== 0) {
          throw new ProviderError(
            'malformed',
            `Unaligned candle timestamp from ${result.provider}`,
            {
              details: { provider: result.provider, timestamp: candle.timestamp },
            },
          );
        }
        rows.push({
          pairId: pair.id,
          timeframe,
          timestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume ?? null,
          provider: result.provider,
        });
      }
    } catch (error) {
      const reason = error instanceof ProviderError ? error.kind : 'malformed';
      await this.events.history(
        'history_chunk_rejected',
        {
          symbol: pair.symbol,
          timeframe,
          provider: result.provider,
          from: start.toISOString(),
          to: end.toISOString(),
          reason,
        },
        'ERROR',
      );
      throw error;
    }
    return rows;
  }

  /** Read stored bucket starts and report holes without changing any row. */
  async scanGaps(
    pair: Pick<PairInfo, 'id' | 'symbol'>,
    timeframe: Timeframe,
    from: Date,
    to: Date,
  ): Promise<CandleGap[]> {
    const timestamps = await this.repository.findTimestamps({
      pairId: pair.id,
      timeframe,
      from,
      to,
    });
    return detectCandleGaps({
      pairId: pair.id,
      symbol: pair.symbol,
      timeframe,
      from,
      to,
      timestamps,
    });
  }

  async run(request: BackfillRequest, now: Date = new Date()): Promise<BackfillResult> {
    const pair = await this.pairOf(request.symbol);
    const stepMs = timeframeStepMs(request.timeframe);
    const firstBucket = bucketStart(request.from.getTime(), stepMs);
    const lastBucket = bucketStart(request.to.getTime(), stepMs);
    const checkpoint = request.resume
      ? await this.state.getCheckpoint(pair.symbol, request.timeframe, request.from, request.to)
      : null;
    let written = 0;
    let chunks = 0;

    for (let cursor = firstBucket; cursor <= lastBucket; cursor += PROVIDER_CANDLE_CHUNK * stepMs) {
      const chunkEnd = Math.min(cursor + (PROVIDER_CANDLE_CHUNK - 1) * stepMs, lastBucket);
      if (checkpoint !== null && chunkEnd <= checkpoint) continue;
      const rows = await this.ingestChunk(
        pair,
        request.timeframe,
        new Date(cursor),
        new Date(chunkEnd),
        now,
      );
      written += await this.repository.upsertMany(rows);
      await this.state.setCheckpoint(
        pair.symbol,
        request.timeframe,
        request.from,
        request.to,
        chunkEnd,
      );
      chunks += 1;
    }

    let gaps = await this.scanGaps(pair, request.timeframe, request.from, request.to);
    let repaired = 0;
    for (const gap of gaps) {
      // The only legal repair is another provider request for the missing span,
      // itself split into adapter-sized chunks.
      const gapStart = Date.parse(gap.from);
      const gapEnd = Date.parse(gap.to);
      for (let cursor = gapStart; cursor <= gapEnd; cursor += PROVIDER_CANDLE_CHUNK * stepMs) {
        const chunkEnd = Math.min(cursor + (PROVIDER_CANDLE_CHUNK - 1) * stepMs, gapEnd);
        const rows = await this.ingestChunk(
          pair,
          request.timeframe,
          new Date(cursor),
          new Date(chunkEnd),
          now,
        );
        repaired += await this.repository.upsertMany(rows);
      }
    }
    if (gaps.length > 0) {
      gaps = await this.scanGaps(pair, request.timeframe, request.from, request.to);
    }
    for (const gap of gaps) {
      await this.events.history(
        'candle_gap_unresolved',
        {
          symbol: gap.symbol,
          timeframe: gap.timeframe,
          from: gap.from,
          to: gap.to,
          missing: gap.missing,
        },
        'ERROR',
      );
    }
    await this.state.markSynced(pair.symbol, request.timeframe, now);
    this.logger.log('history backfill complete', 'WORKER', {
      symbol: pair.symbol,
      timeframe: request.timeframe,
      written,
      chunks,
      repaired,
      gaps: gaps.length,
    });
    return {
      symbol: pair.symbol,
      timeframe: request.timeframe,
      from: request.from.toISOString(),
      to: request.to.toISOString(),
      written,
      chunks,
      repaired,
      gaps,
    };
  }
}
