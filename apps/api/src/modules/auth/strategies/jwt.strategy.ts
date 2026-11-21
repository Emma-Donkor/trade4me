import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthUserView } from '@ts/types';
import { TokenService } from '../token.service';

export type VerifiedIdentity = AuthUserView & Required<Pick<AuthUserView, 'sid' | 'jti' | 'exp'>>;

/**
 * Access-token strategy shared by the HTTP guard and the WebSocket handshake.
 * Verifies signature/claims, checks the Redis blacklist and refreshes the idle
 * session window. Kept framework-light so both transports use one code path.
 */
@Injectable()
export class JwtStrategy {
  constructor(private readonly tokens: TokenService) {}

  async authenticate(token: string): Promise<VerifiedIdentity> {
    const claims = this.tokens.verifyAccess(token);
    if (await this.tokens.isBlacklisted(claims.jti)) {
      throw new UnauthorizedException('Session has been revoked');
    }
    if (!(await this.tokens.touchSession(claims.sid))) {
      throw new UnauthorizedException('Session has expired');
    }
    return {
      id: claims.sub,
      email: claims.email,
      roles: claims.roles,
      sid: claims.sid,
      jti: claims.jti,
      exp: claims.exp,
    };
  }
}
