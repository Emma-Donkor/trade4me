import { Controller, Get, Param, Query } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import {
  newsFeedQuerySchema,
  paginationSchema,
  symbolParamSchema,
  z,
  type SymbolParam,
} from '@ts/validation';
import { idParamSchema } from '../../common/dto/phase7.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { NewsService } from './news.service';

const newsListQuerySchema = newsFeedQuerySchema.extend({
  limit: paginationSchema.shape.limit,
  cursor: paginationSchema.shape.cursor,
});

type NewsListQuery = z.infer<typeof newsListQuerySchema>;
type IdParam = z.infer<typeof idParamSchema>;

@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  feed(@Query(new ZodValidationPipe(newsListQuerySchema)) query: NewsListQuery) {
    return this.news.feed(query);
  }

  @Get('events')
  events(@Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery) {
    return this.news.events(query);
  }

  @Get('sentiment/:symbol')
  sentiment(@Param(new ZodValidationPipe(symbolParamSchema)) symbol: SymbolParam) {
    return this.news.sentiment(symbol);
  }

  @Get(':id')
  article(@Param(new ZodValidationPipe(idParamSchema)) id: IdParam) {
    return this.news.article(id);
  }
}
