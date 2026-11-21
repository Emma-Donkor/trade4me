import { Module } from '@nestjs/common';
import { CommonModule } from '../common.module';
import { AdminModule } from '../../modules/admin/admin.module';
import { AiModule } from '../../modules/ai/ai.module';
import { AuthModule } from '../../modules/auth/auth.module';
import { BacktestingModule } from '../../modules/backtesting/backtesting.module';
import { HealthModule } from '../../modules/health/health.module';
import { HistoricalAnalysisModule } from '../../modules/historical-analysis/historical-analysis.module';
import { MarketModule } from '../../modules/market/market.module';
import { NewsModule } from '../../modules/news/news.module';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { PaperTradingModule } from '../../modules/paper-trading/paper-trading.module';
import { PortfolioModule } from '../../modules/portfolio/portfolio.module';
import { PredictionModule } from '../../modules/prediction/prediction.module';
import { RiskModule } from '../../modules/risk/risk.module';
import { SignalsModule } from '../../modules/signals/signals.module';
import { TechnicalAnalysisModule } from '../../modules/technical-analysis/technical-analysis.module';
import { UsersModule } from '../../modules/users/users.module';
import { WatchlistModule } from '../../modules/watchlist/watchlist.module';

/**
 * Documentation-only module. It registers every HTTP controller without the
 * BullMQ workers or Socket.IO adapter, so `openapi:export` needs no Redis.
 */
@Module({
  imports: [
    CommonModule,
    AuthModule,
    UsersModule,
    HealthModule,
    MarketModule,
    NewsModule,
    TechnicalAnalysisModule,
    HistoricalAnalysisModule,
    PredictionModule,
    SignalsModule,
    RiskModule,
    BacktestingModule,
    PaperTradingModule,
    PortfolioModule,
    WatchlistModule,
    NotificationsModule,
    AiModule,
    AdminModule,
  ],
})
export class OpenApiModule {}
