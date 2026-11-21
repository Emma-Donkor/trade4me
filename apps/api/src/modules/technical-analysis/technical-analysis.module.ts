import { Module } from '@nestjs/common';
import { TechnicalAnalysisController } from './technical-analysis.controller';
import {
  Phase7TechnicalAnalysisService,
  TechnicalAnalysisService,
} from './technical-analysis.service';

@Module({
  controllers: [TechnicalAnalysisController],
  providers: [{ provide: TechnicalAnalysisService, useClass: Phase7TechnicalAnalysisService }],
  exports: [TechnicalAnalysisService],
})
export class TechnicalAnalysisModule {}
