import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { CommonModule } from './common/common.module';
import { AiRateLimitGuard } from './common/guards/ai-rate-limit.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { GlobalRateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import { createValidationPipe } from './config/validation';
import { JobsModule } from './jobs/jobs.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { BacktestingModule } from './modules/backtesting/backtesting.module';
import { HealthModule } from './modules/health/health.module';
import { HistoricalAnalysisModule } from './modules/historical-analysis/historical-analysis.module';
import { MarketModule } from './modules/market/market.module';
import { NewsModule } from './modules/news/news.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaperTradingModule } from './modules/paper-trading/paper-trading.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { PredictionModule } from './modules/prediction/prediction.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { RiskModule } from './modules/risk/risk.module';
import { SignalsModule } from './modules/signals/signals.module';
import { TechnicalAnalysisModule } from './modules/technical-analysis/technical-analysis.module';
import { UsersModule } from './modules/users/users.module';
import { WatchlistModule } from './modules/watchlist/watchlist.module';
import { WebsocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [
    CommonModule,
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    HealthModule,
    AuditModule,
    JobsModule,
    WebsocketModule,
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
  providers: [
    // P06/P07: authenticate first, enforce AI limits, then authorize.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AiRateLimitGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_PIPE, useFactory: (): ValidationPipe => createValidationPipe() },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(GlobalRateLimitMiddleware).forRoutes('*');
  }
}
