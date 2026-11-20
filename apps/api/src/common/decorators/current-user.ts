import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from '../guards/jwt-auth.guard';

/** Injects the authenticated user attached by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    if (context.getType() !== 'http') return undefined;
    return context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  },
);
