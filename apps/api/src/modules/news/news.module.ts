import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService, Phase7NewsService } from './news.service';

@Module({
  controllers: [NewsController],
  providers: [{ provide: NewsService, useClass: Phase7NewsService }],
  exports: [NewsService],
})
export class NewsModule {}
