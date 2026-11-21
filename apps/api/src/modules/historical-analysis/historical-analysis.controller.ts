import { Controller, Get, Param } from '@nestjs/common';
import { symbolParamSchema, type SymbolParam } from '@ts/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { HistoricalAnalysisService } from './historical-analysis.service';

@Controller('analysis')
export class HistoricalAnalysisController {
  constructor(private readonly analysis: HistoricalAnalysisService) {}

  @Get(':symbol/historical')
  historical(@Param(new ZodValidationPipe(symbolParamSchema)) symbol: SymbolParam) {
    return this.analysis.historical(symbol);
  }
}
