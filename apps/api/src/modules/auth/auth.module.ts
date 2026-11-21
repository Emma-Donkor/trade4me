import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RedisModule } from '../redis/redis.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './email/email.service';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import { PasswordService } from './password.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

/** P06 vertical slice: identity, token lifecycle and audit in one module. */
@Module({
  imports: [AuditModule, RedisModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    EmailService,
    JwtStrategy,
    AuthRateLimitGuard,
  ],
  exports: [AuthService, TokenService, JwtStrategy],
})
export class AuthModule {}
