import { Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import type { BacktestConfigInput, z } from '@ts/validation';
import { idParamSchema } from '../../common/dto/phase7.dto';
import { notImplemented } from '../../common/errors/stub-errors';
import { emptyPage, type CursorPage } from '../../common/helpers/pagination';

type IdParam = z.infer<typeof idParamSchema>;

export abstract class BacktestingService {
  abstract queue(_input: BacktestConfigInput): never;
  abstract list(query: PaginationQuery): CursorPage<never>;
  abstract detail(_id: IdParam): never;
}

@Injectable()
export class Phase7BacktestingService extends BacktestingService {
  queue(): never {
    notImplemented('backtest queueing');
  }

  list(query: PaginationQuery): CursorPage<never> {
    return emptyPage(query);
  }

  detail(): never {
    notImplemented('backtest detail');
  }
}
