import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { env } from '@ts/config';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@ts/types';
import { timingSafeEqual } from 'node:crypto';
import { COOKIE_AUTH_KEY } from '../decorators/cookie-auth';
import type { AuthenticatedRequest } from './jwt-auth.guard';
import { TokenService } from '../../modules/auth/token.service';

function sameToken(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Enforces `@CookieAuth()` at runtime. The httpOnly refresh cookie is the only
 * credential accepted on those routes; a body token is never sufficient.
 */
@Injectable()
export class CookieAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const handler = context.getHandler();
    const controller = context.getClass();
    const isCookieRoute = Boolean(
      Reflect.getMetadata(COOKIE_AUTH_KEY, handler) ||
      Reflect.getMetadata(COOKIE_AUTH_KEY, controller),
    );
    if (!isCookieRoute) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[String(env.REFRESH_COOKIE_NAME)];
    if (!token) {
      throw new UnauthorizedException('Refresh cookie is required');
    }

    const csrfCookie = request.cookies?.[CSRF_COOKIE_NAME];
    const csrfHeader = request.headers[CSRF_HEADER_NAME];
    const echoed = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
    if (!csrfCookie || !echoed || !sameToken(csrfCookie, echoed)) {
      throw new ForbiddenException('CSRF token mismatch');
    }

    const claims = this.tokens.verifyRefresh(token);
    request.user = {
      id: claims.sub,
      email: claims.email,
      roles: claims.roles,
      sid: claims.sid,
      jti: claims.jti,
      exp: claims.exp,
    };
    return true;
  }
}
