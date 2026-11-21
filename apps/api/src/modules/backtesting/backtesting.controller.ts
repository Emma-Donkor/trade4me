import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import {
  backtestConfigSchema,
  paginationSchema,
  type BacktestConfigInput,
  type z,
} from '@ts/validation';
import { idParamSchema } from '../../common/dto/phase7.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BacktestingService } from './backtesting.service';

type IdParam = z.infer<typeof idParamSchema>;

@Controller('backtests')
export class BacktestingController {
  constructor(private readonly backtests: BacktestingService) {}

  @Post()
  queue(@Body(new ZodValidationPipe(backtestConfigSchema)) input: BacktestConfigInput) {
    return this.backtests.queue(input);
  }

  @Get()
  list(@Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery) {
    return this.backtests.list(query);
  }

  @Get(':id')
  detail(@Param(new ZodValidationPipe(idParamSchema)) id: IdParam) {
    return this.backtests.detail(id);
  }
}
