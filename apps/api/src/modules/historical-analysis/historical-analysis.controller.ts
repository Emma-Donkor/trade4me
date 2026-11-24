import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  historicalQuerySchema,
  symbolParamSchema,
  type HistoricalQuery,
  type SymbolParam,
} from '@ts/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { HistoricalAnalysisService } from './historical-analysis.service';

@Controller('analysis')
export class HistoricalAnalysisController {
  constructor(private readonly analysis: HistoricalAnalysisService) {}

  @Get(':symbol/historical')
  historical(
    @Param(new ZodValidationPipe(symbolParamSchema)) symbol: SymbolParam,
    @Query(new ZodValidationPipe(historicalQuerySchema)) query: HistoricalQuery,
  ) {
    return this.analysis.historical(symbol, query);
  }
}
