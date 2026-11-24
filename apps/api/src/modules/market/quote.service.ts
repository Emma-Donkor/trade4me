import { Injectable, NotFoundException } from '@nestjs/common';
import { env } from '@ts/config';
import type { MarketOverview, MarketQuote, MarketQuoteView, QuoteResponse } from '@ts/types';
import { z } from '@ts/validation';
import { JsonLogger } from '../../common/logger/json-logger';
import { EventsService } from '../websocket/events.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { marketDataStale, marketDataUnavailable } from './market.errors';
import { SystemEventService } from './system-event.service';
import { isProviderError, timestampRejectionReason } from './providers/provider.errors';
import { ProviderRegistry } from './providers/provider.registry';
import type { ProviderPairContext } from './providers/provider.interface';
import { assertValidTimestamp } from './providers/response-validation';

const quoteSchema = z.object({
  symbol: z.string(),
  bid: z.number(),
  ask: z.number(),
  spread: z.number(),
  timestamp: z.string(),
  provider: z.string(),
});
const cacheEntrySchema = z.object({
  quote: quoteSchema,
  cachedAt: z.string(),
});

type CacheEntry = z.infer<typeof cacheEntrySchema>;

export interface PairMetadata {
  id: string;
  symbol: string;
  pipSize: number;
  spreadPipsTypical: number;
  active: boolean;
  providerSymbols: Record<string, unknown>;
}

/** Prisma Json columns are not guaranteed to be objects at runtime. */
export function symbolsOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Ingestion pipeline owner: provider → validation → DB → Redis → WS/API.
 * Cached quotes are always returned with an explicit freshness flag.
 */
@Injectable()
export class QuoteService {
  readonly staleThresholdSeconds: number;
  readonly quoteTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly registry: ProviderRegistry,
    private readonly events: EventsService,
    private readonly systemEvents: SystemEventService,
    private readonly logger: JsonLogger,
  ) {
    this.staleThresholdSeconds = Math.max(
      1,
      Number(env.MARKET_DATA_STALE_THRESHOLD_SECONDS ?? 120),
    );
    // README §7.5: no cache entry may outlive its acceptable freshness.
    this.quoteTtlSeconds = Math.min(120, Math.max(30, this.staleThresholdSeconds));
  }

  private cacheKey(symbol: string): string {
    return `quote:${symbol}`;
  }

  private contextOf(pair: PairMetadata): ProviderPairContext {
    return {
      pairId: pair.id,
      providerSymbols: pair.providerSymbols,
      pipSize: pair.pipSize,
      spreadPipsTypical: pair.spreadPipsTypical,
      quoteDecimals: Math.min(8, Math.ceil(-Math.log10(pair.pipSize)) + 1),
    };
  }

  private view(quote: MarketQuote, now: Date, source: 'live' | 'cache'): MarketQuoteView {
    const ageMs = now.getTime() - Date.parse(quote.timestamp);
    const dataFreshnessSeconds = Math.max(0, Math.floor(ageMs / 1_000));
    return {
      ...quote,
      dataFreshnessSeconds,
      isStale: dataFreshnessSeconds > this.staleThresholdSeconds,
      source,
    };
  }

  private async readCache(symbol: string, now: Date): Promise<MarketQuoteView | null> {
    const raw = await this.redis.get(this.cacheKey(symbol));
    if (!raw) return null;
    try {
      const entry: CacheEntry = cacheEntrySchema.parse(JSON.parse(raw));
      return this.view(entry.quote, now, 'cache');
    } catch {
      // A corrupt cache entry is dropped; never served as current data.
      await this.redis.del(this.cacheKey(symbol));
      return null;
    }
  }

  private async writeCache(quote: MarketQuote, now: Date): Promise<void> {
    const entry: CacheEntry = { quote, cachedAt: now.toISOString() };
    await this.redis.set(
      this.cacheKey(symbolKey(quote.symbol)),
      JSON.stringify(entry),
      this.quoteTtlSeconds,
    );
  }

  private async findPair(symbol: string): Promise<PairMetadata> {
    const pair = await this.prisma.getClient().currencyPair.findUnique({
      where: { symbol },
      select: {
        id: true,
        symbol: true,
        pipSize: true,
        spreadPipsTypical: true,
        isActive: true,
        providerSymbols: true,
      },
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
      spreadPipsTypical: Number(pair.spreadPipsTypical),
      active: pair.isActive,
      providerSymbols: symbolsOf(pair.providerSymbols),
    };
  }

  private async latestFromDb(symbol: string, now: Date): Promise<MarketQuoteView | null> {
    const pair = await this.prisma.getClient().currencyPair.findUnique({
      where: { symbol },
      select: { id: true },
    });
    if (!pair) return null;
    const row = await this.prisma.getClient().marketQuote.findFirst({
      where: { pairId: pair.id },
      select: { bid: true, ask: true, spread: true, timestamp: true, provider: true },
      orderBy: { timestamp: 'desc' },
    });
    if (!row) return null;
    const quote: MarketQuote = {
      symbol,
      bid: Number(row.bid),
      ask: Number(row.ask),
      spread: Number(row.spread),
      timestamp: row.timestamp.toISOString(),
      provider: row.provider,
    };
    await this.writeCache(quote, now);
    return this.view(quote, now, 'cache');
  }

  /** One pair, one validated upsert, one WS emission. */
  async syncPair(pair: PairMetadata, now: Date = new Date()): Promise<MarketQuoteView> {
    let provider: string | undefined;
    try {
      const result = await this.registry.quote(pair.symbol, this.contextOf(pair));
      provider = result.provider;
      const { value } = result;
      const previous = await this.prisma.getClient().marketQuote.findFirst({
        where: { pairId: pair.id },
        select: { timestamp: true },
        orderBy: { timestamp: 'desc' },
      });
      const timestamp = assertValidTimestamp(value.timestamp, {
        provider,
        now,
        previous: previous?.timestamp ?? null,
      });
      const quote: MarketQuote = { ...value, timestamp: timestamp.toISOString() };
      await this.prisma.getClient().marketQuote.upsert({
        where: {
          quote_pair_timestamp_key: { pairId: pair.id, timestamp },
        },
        create: {
          pairId: pair.id,
          bid: quote.bid,
          ask: quote.ask,
          spread: quote.spread,
          timestamp,
          provider: quote.provider,
        },
        update: {
          bid: quote.bid,
          ask: quote.ask,
          spread: quote.spread,
          provider: quote.provider,
        },
      });
      await this.writeCache(quote, now);
      this.events.quoteUpdate({
        symbol: quote.symbol,
        bid: quote.bid,
        ask: quote.ask,
        timestamp: quote.timestamp,
      });
      return this.view(quote, now, 'live');
    } catch (error) {
      // Only the timestamp check inside this method can surface an
      // `invalid_timestamp` here; adapter-level rejections are logged by the
      // registry with their real provider name before being wrapped.
      if (isProviderError(error) && error.kind === 'invalid_timestamp') {
        await this.systemEvents.timestampRejected(
          provider ?? this.registry.primary,
          timestampRejectionReason(error),
          { symbol: pair.symbol, operation: 'quote', ...error.details },
        );
      }
      throw error;
    }
  }

  /** Regenerate quotes for all active pairs (or a caller-supplied subset). */
  async syncAll(
    symbols?: readonly string[],
    now: Date = new Date(),
  ): Promise<{
    updated: string[];
    failed: string[];
  }> {
    const rows = await this.prisma.getClient().currencyPair.findMany({
      where: {
        isActive: true,
        ...(symbols ? { symbol: { in: [...symbols] } } : {}),
      },
      select: {
        id: true,
        symbol: true,
        pipSize: true,
        spreadPipsTypical: true,
        isActive: true,
        providerSymbols: true,
      },
    });
    const updated: string[] = [];
    const failed: string[] = [];
    for (const row of rows) {
      const pair: PairMetadata = {
        id: row.id,
        symbol: row.symbol,
        pipSize: Number(row.pipSize),
        spreadPipsTypical: Number(row.spreadPipsTypical),
        active: row.isActive,
        providerSymbols: symbolsOf(row.providerSymbols),
      };
      try {
        await this.syncPair(pair, now);
        updated.push(pair.symbol);
      } catch (error) {
        failed.push(pair.symbol);
        this.logger.warn(
          `Quote sync failed for ${pair.symbol}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          'MARKET',
        );
      }
    }
    return { updated, failed };
  }

  async quotes(symbols: readonly string[], now: Date = new Date()): Promise<QuoteResponse> {
    const items: MarketQuoteView[] = [];
    const unavailableSymbols: string[] = [];
    for (const symbol of symbols) {
      const cached = await this.readCache(symbol, now);
      if (cached && !cached.isStale) {
        items.push(cached);
        continue;
      }
      try {
        items.push(await this.syncPair(await this.findPair(symbol), now));
      } catch (error) {
        this.logger.warn(
          `Live quote unavailable for ${symbol}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          'MARKET',
        );
        if (cached) items.push(cached);
        else unavailableSymbols.push(symbol);
      }
    }
    if (items.length === 0) {
      marketDataUnavailable({ symbols: [...symbols], unavailableSymbols });
    }
    return {
      items,
      asOf: now.toISOString(),
      ...(unavailableSymbols.length > 0 ? { unavailableSymbols } : {}),
    };
  }

  /**
   * README §9.2 — analysis callers must refuse stale or incomplete data.
   * The `freshOnly=true` quote query routes here and yields MARKET_DATA_STALE.
   */
  async requireFresh(symbols: readonly string[], now: Date = new Date()): Promise<QuoteResponse> {
    const response = await this.quotes(symbols, now);
    const staleSymbols = response.items.filter((item) => item.isStale).map((item) => item.symbol);
    const unavailableSymbols = response.unavailableSymbols ?? [];
    if (staleSymbols.length > 0 || unavailableSymbols.length > 0) {
      marketDataStale({
        symbols: [...symbols],
        staleSymbols,
        unavailableSymbols: [...unavailableSymbols],
      });
    }
    return response;
  }

  /** README §7.5 — stale cache entries are flagged, never presented as live. */
  async overview(now: Date = new Date()): Promise<MarketOverview> {
    const pairs = await this.prisma.getClient().currencyPair.findMany({
      where: { isActive: true },
      select: { symbol: true },
      orderBy: { symbol: 'asc' },
    });
    const quotes: MarketQuoteView[] = [];
    for (const pair of pairs) {
      const cached =
        (await this.readCache(pair.symbol, now)) ?? (await this.latestFromDb(pair.symbol, now));
      if (cached) quotes.push(cached);
    }
    const byProvider: Record<string, number> = {};
    for (const quote of quotes) {
      byProvider[quote.provider] = (byProvider[quote.provider] ?? 0) + 1;
    }
    return {
      asOf: now.toISOString(),
      totalPairs: pairs.length,
      quotes,
      freshCount: quotes.filter((quote) => !quote.isStale).length,
      staleCount: quotes.filter((quote) => quote.isStale).length,
      unavailableCount: pairs.length - quotes.length,
      byProvider,
    };
  }
}

/** Cache keys use canonical symbols; a slash is part of the key, not a path. */
function symbolKey(symbol: string): string {
  return symbol;
}
