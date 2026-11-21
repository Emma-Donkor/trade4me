import { Module } from '@nestjs/common';
import { RiskController } from './risk.controller';
import { Phase7RiskService, RiskService } from './risk.service';

@Module({
  controllers: [RiskController],
  providers: [{ provide: RiskService, useClass: Phase7RiskService }],
  exports: [RiskService],
})
export class RiskModule {}
