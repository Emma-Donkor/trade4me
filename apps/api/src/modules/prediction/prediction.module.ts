import { Module } from '@nestjs/common';
import { FeatureModule } from '../market/feature.module';
import { MarketModule } from '../market/market.module';
import { HistoricalAnalysisModule } from '../historical-analysis/historical-analysis.module';
import { NewsModule } from '../news/news.module';
import { RiskModule } from '../risk/risk.module';
import { TechnicalAnalysisModule } from '../technical-analysis/technical-analysis.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ReportService } from '../ai/report.service';
import { PredictionController } from './prediction.controller';
import { PredictionEngineService } from './prediction-engine.service';
import { Phase10PredictionService, PredictionService } from './prediction.service';

@Module({
  imports: [
    TechnicalAnalysisModule,
    HistoricalAnalysisModule,
    FeatureModule,
    MarketModule,
    NewsModule,
    RiskModule,
    WebsocketModule,
  ],
  controllers: [PredictionController],
  providers: [
    PredictionEngineService,
    ReportService,
    { provide: PredictionService, useClass: Phase10PredictionService },
  ],
  exports: [PredictionService, PredictionEngineService, ReportService],
})
export class PredictionModule {}
