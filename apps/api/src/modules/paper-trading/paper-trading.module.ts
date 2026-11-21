import { Module } from '@nestjs/common';
import { PaperTradingController } from './paper-trading.controller';
import { PaperTradingService, Phase7PaperTradingService } from './paper-trading.service';

@Module({
  controllers: [PaperTradingController],
  providers: [{ provide: PaperTradingService, useClass: Phase7PaperTradingService }],
  exports: [PaperTradingService],
})
export class PaperTradingModule {}
