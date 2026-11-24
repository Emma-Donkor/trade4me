import { Module } from '@nestjs/common';
import { FeatureModule } from '../market/feature.module';
import { HistoricalAnalysisModule } from '../historical-analysis/historical-analysis.module';
import { TechnicalAnalysisModule } from '../technical-analysis/technical-analysis.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { PredictionController } from './prediction.controller';
import { PredictionEngineService } from './prediction-engine.service';
import { Phase10PredictionService, PredictionService } from './prediction.service';

@Module({
  imports: [TechnicalAnalysisModule, HistoricalAnalysisModule, FeatureModule, WebsocketModule],
  controllers: [PredictionController],
  providers: [
    PredictionEngineService,
    { provide: PredictionService, useClass: Phase10PredictionService },
  ],
  exports: [PredictionService, PredictionEngineService],
})
export class PredictionModule {}
