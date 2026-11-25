import { Injectable } from '@nestjs/common';
import { EXPOSURE_HIGH_PCT, EXPOSURE_WARN_PCT } from '@ts/config';
import type { CurrencyExposure, PaginationQuery } from '@ts/types';
import { cursorPage, emptyPage, type CursorPage } from '../../common/helpers/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { exposureByCurrency } from '../risk/sizing.service';

export type ExposurePage = CursorPage<CurrencyExposure> & {
  warnings: CurrencyExposure[];
  totalExposurePct: number;
};

export abstract class PortfolioService {
  abstract summary(query: PaginationQuery): CursorPage<never> & { positions: never[] };
  abstract exposure(query: PaginationQuery, userId?: string): Promise<ExposurePage>;
}

/** P15 — the exposure analyzer behind GET /portfolio/exposure. */
@Injectable()
export class Phase15PortfolioService extends PortfolioService {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  summary(query: PaginationQuery): CursorPage<never> & { positions: never[] } {
    // P26 owns the full summary; P15 only makes the exposure route real.
    return { ...emptyPage(query), positions: [] };
  }

  async exposure(query: PaginationQuery, userId?: string): Promise<ExposurePage> {
    if (userId === undefined) {
      return { ...emptyPage(query), warnings: [], totalExposurePct: 0 };
    }
    const client = this.prisma.getClient();
    const portfolio = await client.portfolio.findFirst({
      where: { userId },
      include: { positions: { where: { status: 'OPEN' } } },
      orderBy: { createdAt: 'asc' },
    });
    if (portfolio === null) {
      return { ...emptyPage(query), warnings: [], totalExposurePct: 0 };
    }
    const equity =
      Number(portfolio.balance) +
      portfolio.positions.reduce((total, position) => total + Number(position.unrealizedPnl), 0);
    const pairIds = [...new Set(portfolio.positions.map((position) => position.pairId))];
    const pairs = pairIds.length
      ? await client.currencyPair.findMany({
          where: { id: { in: pairIds } },
          select: { id: true, baseCurrency: true, pipSize: true, pointValue: true },
        })
      : [];
    const byPair = new Map(pairs.map((pair) => [pair.id, pair]));
    const positions = portfolio.positions.map((position) => {
      const pair = byPair.get(position.pairId);
      return {
        currency: pair?.baseCurrency ?? 'UNKNOWN',
        size: Number(position.size),
        entryPrice: Number(position.entryPrice),
        pipSize: pair === undefined ? undefined : Number(pair.pipSize),
        pointValue: pair === undefined ? undefined : Number(pair.pointValue),
      };
    });
    const byCurrency = exposureByCurrency(positions, Math.max(equity, 0.01));
    const items: CurrencyExposure[] = [...byCurrency.entries()]
      .map(([currency, exposurePct]) => ({
        currency,
        notional: (exposurePct / 100) * Math.max(equity, 0.01),
        exposurePct: Number(exposurePct.toFixed(4)),
        warning:
          exposurePct >= EXPOSURE_HIGH_PCT
            ? ('HIGH' as const)
            : exposurePct >= EXPOSURE_WARN_PCT
              ? ('MEDIUM' as const)
              : ('LOW' as const),
      }))
      .sort((a, b) => b.exposurePct - a.exposurePct);
    const totalExposurePct = Number(
      items.reduce((total, item) => total + item.exposurePct, 0).toFixed(4),
    );
    return {
      ...cursorPage(items, query),
      warnings: items.filter((item) => item.warning !== 'LOW'),
      totalExposurePct,
    };
  }
}
