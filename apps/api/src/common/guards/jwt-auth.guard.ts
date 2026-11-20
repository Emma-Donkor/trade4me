import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { verify } from 'jsonwebtoken';
import { env } from '@ts/config';
import { IS_PUBLIC_KEY } from '../decorators/public';

export interface AuthenticatedUser {
  id: string;
  roles: string[];
}

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
  requestId?: string;
};

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}

/** JWT guard scaffold; wired globally in P06 once auth endpoints exist. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const handler = context.getHandler();
    const controller = context.getClass();
    if (
      Reflect.getMetadata(IS_PUBLIC_KEY, handler) ||
      Reflect.getMetadata(IS_PUBLIC_KEY, controller)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
    const secret = env.JWT_SECRET ? String(env.JWT_SECRET) : '';

    if (!token) {
      if (!secret && String(env.NODE_ENV) !== 'production') {
        request.user = { id: 'dev-user', roles: ['USER'] };
        return true;
      }
      throw new UnauthorizedException('Missing bearer token');
    }
    if (!secret) throw new UnauthorizedException('JWT secret is not configured');

    try {
      const payload = verify(token, secret) as { sub?: string; roles?: unknown };
      request.user = {
        id: typeof payload.sub === 'string' ? payload.sub : 'unknown',
        roles: Array.isArray(payload.roles)
          ? payload.roles.filter((role): role is string => typeof role === 'string')
          : [],
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
