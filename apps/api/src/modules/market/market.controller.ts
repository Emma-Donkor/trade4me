import { Controller, Get, Query } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import {
  candleRangeQuerySchema,
  paginationSchema,
  quoteQuerySchema,
  type CandleRangeQuery,
  type QuoteQuery,
} from '@ts/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MarketService } from './market.service';

@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get('pairs')
  pairs(@Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery) {
    return this.market.listPairs(query);
  }

  @Get('quote')
  quote(@Query(new ZodValidationPipe(quoteQuerySchema)) query: QuoteQuery) {
    return this.market.quote(query);
  }

  @Get('candles')
  candles(@Query(new ZodValidationPipe(candleRangeQuerySchema)) query: CandleRangeQuery) {
    return this.market.candles(query);
  }

  @Get('overview')
  overview() {
    return this.market.overview();
  }
}
