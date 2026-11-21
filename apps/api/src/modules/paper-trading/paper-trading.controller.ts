import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import {
  modifyPositionSchema,
  paginationSchema,
  paperOrderSchema,
  type ModifyPositionInput,
  type PaperOrderInput,
  type z,
} from '@ts/validation';
import { idParamSchema } from '../../common/dto/phase7.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaperTradingService } from './paper-trading.service';

type IdParam = z.infer<typeof idParamSchema>;

@Controller('paper-trading')
export class PaperTradingController {
  constructor(private readonly paper: PaperTradingService) {}

  @Get('account')
  account() {
    return this.paper.account();
  }

  @Get('positions')
  positions(@Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery) {
    return this.paper.positions(query);
  }

  @Post('positions')
  open(@Body(new ZodValidationPipe(paperOrderSchema)) input: PaperOrderInput) {
    return this.paper.open(input);
  }

  @Patch('positions/:id')
  modify(
    @Param(new ZodValidationPipe(idParamSchema)) id: IdParam,
    @Body(new ZodValidationPipe(modifyPositionSchema)) input: ModifyPositionInput,
  ) {
    return this.paper.modify(id, input);
  }

  @Delete('positions/:id')
  close(@Param(new ZodValidationPipe(idParamSchema)) id: IdParam) {
    return this.paper.close(id);
  }
}
