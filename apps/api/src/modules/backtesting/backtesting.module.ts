import { Module } from '@nestjs/common';
import { BacktestingController } from './backtesting.controller';
import { BacktestingService, Phase7BacktestingService } from './backtesting.service';

@Module({
  controllers: [BacktestingController],
  providers: [{ provide: BacktestingService, useClass: Phase7BacktestingService }],
  exports: [BacktestingService],
})
export class BacktestingModule {}
