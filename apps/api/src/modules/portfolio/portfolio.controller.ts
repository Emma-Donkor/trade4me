import { Controller, Get, Query } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import { paginationSchema } from '@ts/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  summary(@Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery) {
    return this.portfolio.summary(query);
  }

  @Get('exposure')
  exposure(@Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery) {
    return this.portfolio.exposure(query);
  }
}
