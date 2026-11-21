import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { UpdateProfileInput, UpdateRiskProfileInput, UserView } from '@ts/types';
import { updateProfileSchema, updateRiskProfileSchema } from '@ts/validation';
import { CurrentUser } from '../../common/decorators/current-user';
import type { AuthenticatedRequest, AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

/** README §8.2: every route below is scoped to the authenticated user. */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserView> {
    return this.users.me(user.id);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) input: UpdateProfileInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserView> {
    return this.users.updateMe(user.id, input, {
      actorId: user.id,
      ip: request.ip || request.socket?.remoteAddress,
      requestId: request.requestId,
    });
  }

  @Get('me/risk-profile')
  riskProfile(@CurrentUser() user: AuthenticatedUser): Promise<UserView['riskProfile']> {
    return this.users.riskProfile(user.id);
  }

  @Patch('me/risk-profile')
  updateRiskProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateRiskProfileSchema)) input: UpdateRiskProfileInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserView['riskProfile']> {
    return this.users.updateRiskProfile(user.id, input, {
      actorId: user.id,
      ip: request.ip || request.socket?.remoteAddress,
      requestId: request.requestId,
    });
  }

  @Get('me/sessions')
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.users.sessions(user.id);
  }
}
