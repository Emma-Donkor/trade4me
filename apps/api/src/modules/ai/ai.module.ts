import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService, Phase7AiService } from './ai.service';

@Module({
  controllers: [AiController],
  providers: [{ provide: AiService, useClass: Phase7AiService }],
  exports: [AiService],
})
export class AiModule {}
