import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { sign } from 'jsonwebtoken';
import { env } from '@ts/config';
import { JwtAuthGuard, type AuthenticatedRequest } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles';

function contextFor(request: AuthenticatedRequest, roles?: string[]) {
  const handler = () => undefined;
  if (roles) Reflect.defineMetadata(ROLES_KEY, roles, handler);
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard();
  const originalSecret = (env as { JWT_SECRET?: string }).JWT_SECRET;

  afterEach(() => {
    (env as { JWT_SECRET?: string }).JWT_SECRET = originalSecret;
  });

  it('accepts a valid bearer token and attaches the user', () => {
    (env as { JWT_SECRET?: string }).JWT_SECRET = 'phase03-test-secret';
    const token = sign({ sub: 'user-1', roles: ['ANALYST'] }, 'phase03-test-secret');
    const request = { headers: { authorization: `Bearer ${token}` } } as AuthenticatedRequest;

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.user).toEqual({ id: 'user-1', roles: ['ANALYST'] });
  });

  it('rejects requests without a token when a secret is configured', () => {
    (env as { JWT_SECRET?: string }).JWT_SECRET = 'phase03-test-secret';
    expect(() => guard.canActivate(contextFor({ headers: {} } as AuthenticatedRequest))).toThrow(
      'Missing bearer token',
    );
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows a user with the required role and denies one without it', () => {
    const allowed = { user: { id: '1', roles: ['ADMIN'] } } as AuthenticatedRequest;
    const denied = { user: { id: '2', roles: ['USER'] } } as AuthenticatedRequest;

    expect(guard.canActivate(contextFor(allowed, ['ADMIN']))).toBe(true);
    expect(() => guard.canActivate(contextFor(denied, ['ADMIN']))).toThrow('Insufficient role');
  });

  it('allows unannotated handlers', () => {
    expect(guard.canActivate(contextFor({ headers: {} } as AuthenticatedRequest))).toBe(true);
  });
});
