import { Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import type { ModifyPositionInput, PaperOrderInput, z } from '@ts/validation';
import { idParamSchema } from '../../common/dto/phase7.dto';
import { notImplemented } from '../../common/errors/stub-errors';
import { emptyPage, type CursorPage } from '../../common/helpers/pagination';

type IdParam = z.infer<typeof idParamSchema>;

export abstract class PaperTradingService {
  abstract account(): never;
  abstract positions(query: PaginationQuery): CursorPage<never>;
  abstract open(_input: PaperOrderInput): never;
  abstract modify(_id: IdParam, _input: ModifyPositionInput): never;
  abstract close(_id: IdParam): never;
}

@Injectable()
export class Phase7PaperTradingService extends PaperTradingService {
  account(): never {
    notImplemented('paper trading account');
  }

  positions(query: PaginationQuery): CursorPage<never> {
    return emptyPage(query);
  }

  open(): never {
    notImplemented('paper order opening');
  }

  modify(): never {
    notImplemented('paper position modification');
  }

  close(): never {
    notImplemented('paper position closing');
  }
}
