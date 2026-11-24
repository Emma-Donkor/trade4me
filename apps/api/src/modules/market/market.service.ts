import { Injectable } from '@nestjs/common';
import type { CandleHistoryPage, MarketOverview, QuoteResponse } from '@ts/types';
import type { PaginationQuery } from '@ts/types';
import type { CandleRangeQuery, QuoteQuery } from '@ts/validation';
import { cursorPage, type CursorPage } from '../../common/helpers/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CandleService } from './candles.service';
import { QuoteService } from './quote.service';

export interface MarketPairView {
  id: string;
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  active: boolean;
  pipSize: number;
  pointValue: number;
  spreadPipsTypical: number;
}

export abstract class MarketService {
  abstract listPairs(query: PaginationQuery): Promise<CursorPage<MarketPairView>>;
  abstract quote(query: QuoteQuery): Promise<QuoteResponse>;
  /** Real, projected and cached range reads (P09). */
  abstract candles(query: CandleRangeQuery): Promise<CandleHistoryPage>;
  abstract overview(): Promise<MarketOverview>;
}

@Injectable()
export class MarketServiceImpl extends MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuoteService,
    private readonly candlesService: CandleService,
  ) {
    super();
  }

  async listPairs(query: PaginationQuery): Promise<CursorPage<MarketPairView>> {
    const pairs = await this.prisma.getClient().currencyPair.findMany({
      orderBy: { symbol: 'asc' },
      select: {
        id: true,
        symbol: true,
        baseCurrency: true,
        quoteCurrency: true,
        isActive: true,
        pipSize: true,
        pointValue: true,
        spreadPipsTypical: true,
      },
    });
    return cursorPage(
      pairs.map((pair) => ({
        id: pair.id,
        symbol: pair.symbol,
        baseCurrency: pair.baseCurrency,
        quoteCurrency: pair.quoteCurrency,
        active: pair.isActive,
        pipSize: Number(pair.pipSize),
        pointValue: Number(pair.pointValue),
        spreadPipsTypical: Number(pair.spreadPipsTypical),
      })),
      query,
    );
  }

  quote(query: QuoteQuery): Promise<QuoteResponse> {
    const symbols = query.symbols
      ? Array.isArray(query.symbols)
        ? query.symbols
        : query.symbols.split(',').map((symbol) => symbol.trim())
      : [query.symbol as string];
    return query.freshOnly ? this.quotes.requireFresh(symbols) : this.quotes.quotes(symbols);
  }

  candles(query: CandleRangeQuery): Promise<CandleHistoryPage> {
    return this.candlesService.query(query);
  }

  overview(): Promise<MarketOverview> {
    return this.quotes.overview();
  }
}

/** Backwards-compatible name used by the P07 module wiring. */
export { MarketServiceImpl as Phase7MarketService };
