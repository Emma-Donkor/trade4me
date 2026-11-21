import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { env } from '@ts/config';
import { CSRF_COOKIE_NAME } from '@ts/types';
import type { AuthTokens, MessageResponse, SessionInfo, UserView } from '@ts/types';
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@ts/validation';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@ts/validation';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { CookieAuth } from '../../common/decorators/cookie-auth';
import { clientIp } from '../../common/helpers/client-ip';
import { Public } from '../../common/decorators/public';
import { CurrentUser } from '../../common/decorators/current-user';
import type { AuthenticatedRequest, AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { AuthService, type RequestContext } from './auth.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';

interface LoginResult {
  user: UserView;
  tokens: AuthTokens;
}

/** README §8.2 auth catalog. All state-changing cookie auth uses SameSite. */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private context(request: AuthenticatedRequest): RequestContext {
    return {
      actorId: request.user?.id,
      ip: clientIp(request),
      requestId: request.requestId,
    };
  }

  private cookieOptions(): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict';
    path: string;
    maxAge: number;
  } {
    const match = /^(\d+)([smhd])$/.exec(String(env.JWT_REFRESH_TTL).trim());
    const units: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    const multiplier = match ? (units[match[2]] ?? 86_400_000) : 86_400_000;
    return {
      httpOnly: true,
      secure: Boolean(env.REFRESH_COOKIE_SECURE),
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: match ? Number(match[1]) * multiplier : 7 * 86_400_000,
    };
  }

  private setRefreshCookie(response: Response, tokens: AuthTokens): void {
    const options = this.cookieOptions();
    response.cookie(String(env.REFRESH_COOKIE_NAME), tokens.refreshToken, options);
    // The CSRF cookie is readable by the same-origin client so it can echo the
    // token in a header. It is not an authentication credential.
    response.cookie(CSRF_COOKIE_NAME, randomBytes(24).toString('hex'), {
      ...options,
      httpOnly: false,
      path: '/',
    });
  }

  @Public()
  @Post('register')
  register(
    @Body(new ZodValidationPipe(registerSchema)) input: RegisterInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<MessageResponse> {
    return this.auth.register(input, this.context(request));
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResult> {
    const result = await this.auth.login(input, this.context(request));
    this.setRefreshCookie(response, result.tokens);
    return result;
  }

  @Public()
  @CookieAuth()
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResult> {
    const token = request.cookies?.[String(env.REFRESH_COOKIE_NAME)];
    if (!token) throw new UnauthorizedException('Refresh cookie is required');
    const result = await this.auth.refresh(token);
    this.setRefreshCookie(response, result.tokens);
    return result;
  }

  @Public()
  @CookieAuth()
  @HttpCode(200)
  @Post('logout')
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MessageResponse> {
    const token = request.cookies?.[String(env.REFRESH_COOKIE_NAME)];
    if (!token) throw new UnauthorizedException('Refresh cookie is required');
    const result = await this.auth.logout(token, this.context(request));
    response.clearCookie(String(env.REFRESH_COOKIE_NAME), { path: '/api/v1/auth' });
    response.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
    return result;
  }

  @Public()
  @HttpCode(200)
  @Post('verify-email')
  verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: { token: string },
  ): Promise<MessageResponse> {
    return this.auth.verifyEmail(body.token);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) input: ForgotPasswordInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<MessageResponse> {
    return this.auth.forgotPassword(input, this.context(request));
  }

  @Public()
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) input: ResetPasswordInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<MessageResponse> {
    return this.auth.resetPassword(input, this.context(request));
  }

  @Post('mfa/setup')
  mfaSetup(): never {
    return this.auth.mfaSetup();
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthenticatedUser): Promise<SessionInfo[]> {
    return this.auth.sessions(user.id);
  }

  @Delete('sessions/:id')
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    return this.auth.revokeSession(user.id, request.params.id);
  }
}
