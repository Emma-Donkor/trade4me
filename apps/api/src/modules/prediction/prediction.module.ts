import { Module } from '@nestjs/common';
import { PredictionController } from './prediction.controller';
import { Phase7PredictionService, PredictionService } from './prediction.service';

@Module({
  controllers: [PredictionController],
  providers: [{ provide: PredictionService, useClass: Phase7PredictionService }],
  exports: [PredictionService],
})
export class PredictionModule {}
