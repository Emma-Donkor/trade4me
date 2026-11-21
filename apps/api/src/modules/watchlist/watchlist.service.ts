import { Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import type { CreateWatchlistInput, z } from '@ts/validation';
import {
  addWatchlistItemSchema,
  idQuerySchema,
  removeWatchlistItemQuerySchema,
} from '../../common/dto/phase7.dto';
import { notImplemented } from '../../common/errors/stub-errors';
import { emptyPage, type CursorPage } from '../../common/helpers/pagination';

type IdQuery = z.infer<typeof idQuerySchema>;
type AddWatchlistItemInput = z.infer<typeof addWatchlistItemSchema>;
type RemoveWatchlistItemQuery = z.infer<typeof removeWatchlistItemQuerySchema>;

export abstract class WatchlistService {
  abstract lists(query: PaginationQuery): CursorPage<never>;
  abstract create(_input: CreateWatchlistInput): never;
  abstract removeList(_query: IdQuery): never;
  abstract items(query: PaginationQuery): CursorPage<never>;
  abstract addItem(_input: AddWatchlistItemInput): never;
  abstract removeItem(_query: RemoveWatchlistItemQuery): never;
}

@Injectable()
export class Phase7WatchlistService extends WatchlistService {
  lists(query: PaginationQuery): CursorPage<never> {
    return emptyPage(query);
  }

  create(): never {
    notImplemented('watchlist creation');
  }

  removeList(): never {
    notImplemented('watchlist deletion');
  }

  items(query: PaginationQuery): CursorPage<never> {
    return emptyPage(query);
  }

  addItem(): never {
    notImplemented('watchlist item creation');
  }

  removeItem(): never {
    notImplemented('watchlist item deletion');
  }
}
