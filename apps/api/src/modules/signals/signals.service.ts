import { Injectable, NotFoundException } from '@nestjs/common';
import type { CursorPage } from '../../common/helpers/pagination';
import { cursorPage } from '../../common/helpers/pagination';
import type { ScannerRow, TradeSignal } from '@ts/types';
import type { z } from '@ts/validation';
import { idParamSchema } from '../../common/dto/phase7.dto';
import { PrismaService } from '../prisma/prisma.service';
import { mapSignal, mapSignalDetail, type SignalDetail } from './signal.mapper';
import { ScannerService } from './scanner.service';
import type { ScannerHttpQuery, SignalsQuery } from './dto/signals.dto';

type IdParam = z.infer<typeof idParamSchema>;

export abstract class SignalsService {
  abstract recent(query: SignalsQuery): Promise<CursorPage<TradeSignal>>;
  abstract detail(id: IdParam): Promise<SignalDetail>;
  abstract scan(query: ScannerHttpQuery): Promise<CursorPage<ScannerRow>>;
}

/** P16 — real persisted signals and a live, cached all-pairs scan. */
@Injectable()
export class Phase16SignalsService extends SignalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scanner: ScannerService,
  ) {
    super();
  }

  async recent(query: SignalsQuery): Promise<CursorPage<TradeSignal>> {
    const rows = await this.prisma.getClient().tradeSignal.findMany({
      where: {
        ...(query.action === undefined ? {} : { action: query.action }),
        ...(query.symbol === undefined ? {} : { pair: { symbol: query.symbol } }),
        ...(query.score === undefined ? {} : { score: { gte: query.score } }),
      },
      include: { pair: true, features: true, analyses: true },
      orderBy: { generatedAt: 'desc' },
      take: 500,
    });
    return cursorPage(
      rows.map((row) =>
        mapSignal({
          ...row,
          ...(row.entryPrice === null ? { entryPrice: null } : {}),
          ...(row.stopLoss === null ? { stopLoss: null } : {}),
          ...(row.takeProfit === null ? { takeProfit: null } : {}),
          ...(row.riskReward === null ? { riskReward: null } : {}),
        }),
      ),
      query,
    );
  }

  async detail({ id }: IdParam): Promise<SignalDetail> {
    const row = await this.prisma.getClient().tradeSignal.findUnique({
      where: { id },
      include: { pair: true, features: true, analyses: true },
    });
    if (row === null) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Trade signal ${id} was not found`,
        details: { id },
      });
    }
    return mapSignalDetail(row);
  }

  scan(query: ScannerHttpQuery): Promise<CursorPage<ScannerRow>> {
    return this.scanner.scan(query);
  }
}

/** Backwards-compatible name used by earlier module wiring/tests. */
export { Phase16SignalsService as Phase7SignalsService };
