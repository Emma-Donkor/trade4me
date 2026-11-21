import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import {
  createWatchlistSchema,
  paginationSchema,
  type CreateWatchlistInput,
  type z,
} from '@ts/validation';
import {
  addWatchlistItemSchema,
  idQuerySchema,
  removeWatchlistItemQuerySchema,
} from '../../common/dto/phase7.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { WatchlistService } from './watchlist.service';

type AddWatchlistItemInput = z.infer<typeof addWatchlistItemSchema>;
type RemoveWatchlistItemQuery = z.infer<typeof removeWatchlistItemQuerySchema>;

@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly watchlist: WatchlistService) {}

  @Get()
  lists(@Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery) {
    return this.watchlist.lists(query);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createWatchlistSchema)) input: CreateWatchlistInput) {
    return this.watchlist.create(input);
  }

  @Delete()
  removeList(@Query(new ZodValidationPipe(idQuerySchema)) query: { id?: string }) {
    return this.watchlist.removeList(query);
  }

  @Get('items')
  items(@Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery) {
    return this.watchlist.items(query);
  }

  @Post('items')
  addItem(@Body(new ZodValidationPipe(addWatchlistItemSchema)) input: AddWatchlistItemInput) {
    return this.watchlist.addItem(input);
  }

  @Delete('items')
  removeItem(
    @Query(new ZodValidationPipe(removeWatchlistItemQuerySchema)) query: RemoveWatchlistItemQuery,
  ) {
    return this.watchlist.removeItem(query);
  }
}
