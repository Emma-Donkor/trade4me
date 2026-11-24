import { Module } from '@nestjs/common';
import { HistoricalAnalysisModule } from '../historical-analysis/historical-analysis.module';
import { TechnicalAnalysisModule } from '../technical-analysis/technical-analysis.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { PredictionController } from './prediction.controller';
import { Phase10PredictionService, PredictionService } from './prediction.service';

@Module({
  imports: [TechnicalAnalysisModule, HistoricalAnalysisModule, WebsocketModule],
  controllers: [PredictionController],
  providers: [{ provide: PredictionService, useClass: Phase10PredictionService }],
  exports: [PredictionService],
})
export class PredictionModule {}
