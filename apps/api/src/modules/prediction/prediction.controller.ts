import { Controller, Get, Param } from '@nestjs/common';
import { symbolParamSchema, type SymbolParam } from '@ts/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PredictionService } from './prediction.service';

@Controller('analysis')
export class PredictionController {
  constructor(private readonly predictions: PredictionService) {}

  @Get(':symbol/report')
  report(@Param(new ZodValidationPipe(symbolParamSchema)) symbol: SymbolParam) {
    return this.predictions.report(symbol);
  }

  @Get(':symbol')
  assessment(@Param(new ZodValidationPipe(symbolParamSchema)) symbol: SymbolParam) {
    return this.predictions.assessment(symbol);
  }
}
