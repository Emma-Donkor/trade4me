import { Controller, Get, Query } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import { paginationSchema } from '@ts/validation';
import { CurrentUser } from '../../common/decorators/current-user';
import type { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
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
  exposure(
    @Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.portfolio.exposure(query, user?.id);
  }
}
