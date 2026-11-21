import { Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import { emptyPage, type CursorPage } from '../../common/helpers/pagination';

export abstract class PortfolioService {
  abstract summary(query: PaginationQuery): CursorPage<never> & { positions: never[] };
  abstract exposure(query: PaginationQuery): CursorPage<never> & { warnings: never[] };
}

@Injectable()
export class Phase7PortfolioService extends PortfolioService {
  summary(query: PaginationQuery): CursorPage<never> & { positions: never[] } {
    return { ...emptyPage(query), positions: [] };
  }

  exposure(query: PaginationQuery): CursorPage<never> & { warnings: never[] } {
    return { ...emptyPage(query), warnings: [] };
  }
}
