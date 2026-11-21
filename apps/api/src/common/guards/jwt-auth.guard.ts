import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { verify } from 'jsonwebtoken';
import { env } from '@ts/config';
import { JwtStrategy } from '../../modules/auth/strategies/jwt.strategy';
import { IS_PUBLIC_KEY } from '../decorators/public';

export interface AuthenticatedUser {
  id: string;
  roles: string[];
  email?: string;
  sid?: string;
  jti?: string;
  exp?: number;
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

/**
 * Global default guard (P06). `@Public()` opts a route out. When the auth
 * strategy is available, tokens are checked against the Redis blacklist and
 * session idle window; the synchronous fallback exists only for isolated
 * guard tests. Non-public requests always require a verified identity.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Optional() private readonly strategy?: JwtStrategy) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
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
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    if (this.strategy) return this.authenticate(request, token);

    // Legacy synchronous path (no DI container): signature verification only.
    const secret = env.JWT_SECRET ? String(env.JWT_SECRET) : '';
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

  private async authenticate(request: AuthenticatedRequest, token: string): Promise<boolean> {
    const identity = await this.strategy!.authenticate(token);
    request.user = identity;
    return true;
  }
}
