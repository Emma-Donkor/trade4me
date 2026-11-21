import { Module } from '@nestjs/common';
import { Phase7WatchlistService, WatchlistService } from './watchlist.service';
import { WatchlistController } from './watchlist.controller';

@Module({
  controllers: [WatchlistController],
  providers: [{ provide: WatchlistService, useClass: Phase7WatchlistService }],
  exports: [WatchlistService],
})
export class WatchlistModule {}
