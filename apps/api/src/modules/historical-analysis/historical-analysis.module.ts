import { Module } from '@nestjs/common';
import { HistoricalAnalysisController } from './historical-analysis.controller';
import {
  Phase7HistoricalAnalysisService,
  HistoricalAnalysisService,
} from './historical-analysis.service';

@Module({
  controllers: [HistoricalAnalysisController],
  providers: [{ provide: HistoricalAnalysisService, useClass: Phase7HistoricalAnalysisService }],
  exports: [HistoricalAnalysisService],
})
export class HistoricalAnalysisModule {}
