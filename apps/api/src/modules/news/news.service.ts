import { Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import type { SymbolParam, z } from '@ts/validation';
import { emptyPage, type CursorPage } from '../../common/helpers/pagination';
import { insufficientData, notImplemented } from '../../common/errors/stub-errors';
import { idParamSchema } from '../../common/dto/phase7.dto';

type IdParam = z.infer<typeof idParamSchema>;

export abstract class NewsService {
  abstract feed(query: PaginationQuery): CursorPage<never>;
  abstract events(query: PaginationQuery): CursorPage<never>;
  abstract article(id: IdParam): never;
  abstract sentiment(symbol: SymbolParam): never;
}

@Injectable()
export class Phase7NewsService extends NewsService {
  feed(query: PaginationQuery): CursorPage<never> {
    return emptyPage(query);
  }

  events(query: PaginationQuery): CursorPage<never> {
    return emptyPage(query);
  }

  article(): never {
    notImplemented('news article detail');
  }

  sentiment(symbol: SymbolParam): never {
    insufficientData('news sentiment', { symbol: symbol.symbol });
  }
}
