import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { HistoricalAnalysisController } from './historical-analysis.controller';
import {
  HistoricalAnalysisServiceImpl,
  HistoricalAnalysisService,
} from './historical-analysis.service';

@Module({
  imports: [MarketModule],
  controllers: [HistoricalAnalysisController],
  providers: [{ provide: HistoricalAnalysisService, useClass: HistoricalAnalysisServiceImpl }],
  exports: [HistoricalAnalysisService],
})
export class HistoricalAnalysisModule {}
