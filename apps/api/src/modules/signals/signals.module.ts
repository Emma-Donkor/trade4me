import { Module } from '@nestjs/common';
import { SignalsController } from './signals.controller';
import { Phase7SignalsService, SignalsService } from './signals.service';

@Module({
  controllers: [SignalsController],
  providers: [{ provide: SignalsService, useClass: Phase7SignalsService }],
  exports: [SignalsService],
})
export class SignalsModule {}
