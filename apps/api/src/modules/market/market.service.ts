import { Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import type { CandleRangeQuery, QuoteQuery } from '@ts/validation';
import { cursorPage, type CursorPage } from '../../common/helpers/pagination';
import { insufficientData } from '../../common/errors/stub-errors';
import { PrismaService } from '../prisma/prisma.service';

export interface MarketPairView {
  id: string;
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  active: boolean;
  pipSize: number;
  pointValue: number;
  spreadPipsTypical: number;
  providerSymbols: unknown;
}

export abstract class MarketService {
  abstract listPairs(query: PaginationQuery): Promise<CursorPage<MarketPairView>>;
  abstract quote(query: QuoteQuery): never;
  abstract candles(query: CandleRangeQuery): never;
  abstract overview(): never;
}

/** P07 wires only the real pair read; quotes and candles arrive in P08/P09. */
@Injectable()
export class Phase7MarketService extends MarketService {
  constructor(private readonly prisma: PrismaService) {
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
        providerSymbols: true,
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
        providerSymbols: pair.providerSymbols,
      })),
      query,
    );
  }

  quote(query: QuoteQuery): never {
    insufficientData('current quotes', { symbol: query.symbol });
  }

  candles(query: CandleRangeQuery): never {
    insufficientData('historical candles', {
      symbol: query.symbol,
      timeframe: query.timeframe,
    });
  }

  overview(): never {
    insufficientData('market overview');
  }
}
