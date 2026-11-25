import { Module } from '@nestjs/common';
import { PredictionModule } from '../prediction/prediction.module';
import { TechnicalAnalysisModule } from '../technical-analysis/technical-analysis.module';
import { AiController } from './ai.controller';
import { AiService, Phase17AiService } from './ai.service';
import { ReportService } from './report.service';

@Module({
  imports: [TechnicalAnalysisModule, PredictionModule],
  controllers: [AiController],
  providers: [ReportService, { provide: AiService, useClass: Phase17AiService }],
  exports: [AiService, ReportService],
})
export class AiModule {}
