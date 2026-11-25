import { Module } from '@nestjs/common';
import { FeatureModule } from '../market/feature.module';
import { MarketModule } from '../market/market.module';
import { HistoricalAnalysisModule } from '../historical-analysis/historical-analysis.module';
import { NewsModule } from '../news/news.module';
import { PredictionModule } from '../prediction/prediction.module';
import { RiskModule } from '../risk/risk.module';
import { TechnicalAnalysisModule } from '../technical-analysis/technical-analysis.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ScannerService } from './scanner.service';
import { DecisionWeightsService } from './scoring/weights.service';
import { SignalGenerationService } from './signal-generation.service';
import { SignalsController } from './signals.controller';
import { Phase16SignalsService, SignalsService } from './signals.service';

@Module({
  imports: [
    MarketModule,
    FeatureModule,
    TechnicalAnalysisModule,
    HistoricalAnalysisModule,
    PredictionModule,
    NewsModule,
    RiskModule,
    WebsocketModule,
  ],
  controllers: [SignalsController],
  providers: [
    DecisionWeightsService,
    SignalGenerationService,
    ScannerService,
    { provide: SignalsService, useClass: Phase16SignalsService },
  ],
  exports: [SignalsService, SignalGenerationService, ScannerService, DecisionWeightsService],
})
export class SignalsModule {}
