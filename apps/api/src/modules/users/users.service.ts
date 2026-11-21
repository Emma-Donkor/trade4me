import { Injectable } from '@nestjs/common';
import type { SessionInfo, UpdateProfileInput, UpdateRiskProfileInput, UserView } from '@ts/types';
import { AuthService, type RequestContext } from '../auth/auth.service';

/** P06: user-owned settings routes delegate to the identity service. */
@Injectable()
export class UsersService {
  constructor(private readonly auth: AuthService) {}

  me(userId: string): Promise<UserView> {
    return this.auth.me(userId);
  }

  updateMe(userId: string, input: UpdateProfileInput, context: RequestContext): Promise<UserView> {
    return this.auth.updateMe(userId, input, context);
  }

  riskProfile(userId: string): Promise<UserView['riskProfile']> {
    return this.auth.riskProfile(userId);
  }

  updateRiskProfile(
    userId: string,
    input: UpdateRiskProfileInput,
    context: RequestContext,
  ): Promise<UserView['riskProfile']> {
    return this.auth.updateRiskProfile(userId, input, context);
  }

  sessions(userId: string): Promise<SessionInfo[]> {
    return this.auth.sessions(userId);
  }
}
