import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { NewsModule } from '../news/news.module';
import { RiskController } from './risk.controller';
import { Phase15RiskService, RiskService } from './risk.service';

@Module({
  imports: [MarketModule, NewsModule],
  controllers: [RiskController],
  providers: [{ provide: RiskService, useClass: Phase15RiskService }],
  exports: [RiskService],
})
export class RiskModule {}
