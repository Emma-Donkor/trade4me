import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService, Phase7MarketService } from './market.service';

@Module({
  controllers: [MarketController],
  providers: [{ provide: MarketService, useClass: Phase7MarketService }],
  exports: [MarketService],
})
export class MarketModule {}
