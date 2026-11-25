import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { Phase15PortfolioService, PortfolioService } from './portfolio.service';

@Module({
  controllers: [PortfolioController],
  providers: [{ provide: PortfolioService, useClass: Phase15PortfolioService }],
  exports: [PortfolioService],
})
export class PortfolioModule {}
