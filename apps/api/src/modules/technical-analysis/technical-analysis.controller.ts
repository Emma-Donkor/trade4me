import { Controller, Get, Param, Query } from '@nestjs/common';
import { timeframeSchema, z, type SymbolParam, symbolParamSchema } from '@ts/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TechnicalAnalysisService } from './technical-analysis.service';

const technicalQuerySchema = z.strictObject({
  timeframe: timeframeSchema.optional(),
  indicators: z.array(z.string().min(1)).optional(),
});

type TechnicalQuery = z.infer<typeof technicalQuerySchema>;

@Controller('analysis')
export class TechnicalAnalysisController {
  constructor(private readonly analysis: TechnicalAnalysisService) {}

  @Get(':symbol/technical')
  technical(
    @Param(new ZodValidationPipe(symbolParamSchema)) symbol: SymbolParam,
    @Query(new ZodValidationPipe(technicalQuerySchema)) query: TechnicalQuery,
  ) {
    void query;
    return this.analysis.technical(symbol);
  }

  @Get(':symbol/regime')
  regime(@Param(new ZodValidationPipe(symbolParamSchema)) symbol: SymbolParam) {
    return this.analysis.regime(symbol);
  }
}
