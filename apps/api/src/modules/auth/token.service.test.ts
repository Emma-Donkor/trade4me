import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { env } from '@ts/config';
import { RedisService } from '../redis/redis.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService, type AuthUser } from './token.service';

function memoryRedis(): RedisService {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  return {
    key: (...parts: string[]) => `tradesense:${parts.join(':')}`,
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    getdel: jest.fn(async (key: string) => {
      const value = values.get(key) ?? null;
      values.delete(key);
      return value;
    }),
    consumeAndReplaceRefresh: jest.fn(
      async (
        oldKey: string,
        newKey: string,
        familyKey: string,
        input: {
          userId: string;
          familyId: string;
          sessionId: string;
          oldMember: string;
          replacement: string;
          newMember: string;
        },
      ) => {
        const stored = values.get(oldKey);
        if (!stored) return sets.has(familyKey) ? 'reuse' : 'revoked';
        const record = JSON.parse(stored) as {
          userId: string;
          familyId: string;
          sessionId: string;
        };
        if (
          record.userId !== input.userId ||
          record.familyId !== input.familyId ||
          record.sessionId !== input.sessionId
        ) {
          return 'mismatch';
        }
        values.delete(oldKey);
        sets.get(familyKey)?.delete(input.oldMember);
        values.set(newKey, input.replacement);
        const family = sets.get(familyKey) ?? new Set<string>();
        family.add(input.newMember);
        sets.set(familyKey, family);
        return 'rotated';
      },
    ),
    set: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    del: jest.fn(async (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) removed += values.delete(key) ? 1 : 0;
      return removed;
    }),
    exists: jest.fn(async (key: string) => values.has(key) || sets.has(key)),
    expire: jest.fn(async () => undefined),
    incrWithTtl: jest.fn(async () => 1),
    addToSet: jest.fn(async (key: string, ...members: string[]) => {
      const set = sets.get(key) ?? new Set<string>();
      members.forEach((member) => set.add(member));
      sets.set(key, set);
    }),
    removeFromSet: jest.fn(async (key: string, ...members: string[]) => {
      members.forEach((member) => sets.get(key)?.delete(member));
    }),
    membersOfSet: jest.fn(async (key: string) => [...(sets.get(key) ?? [])]),
    deleteSet: jest.fn(async (key: string) => {
      sets.delete(key);
    }),
    scanKeys: jest.fn(async (pattern: string) => {
      const prefix = pattern.replace('*', '');
      return [...values.keys()].filter((key) => key.startsWith(prefix));
    }),
  } as unknown as RedisService;
}

const user: AuthUser = { id: 'user-1', email: 'user@example.com', roles: ['USER'] };

describe('P06 TokenService', () => {
  const mutableEnv = env as unknown as Record<string, unknown>;
  const original = { ...mutableEnv };
  let redis: RedisService;
  let tokens: TokenService;

  beforeEach(() => {
    mutableEnv.JWT_SECRET = 'test-access-secret';
    mutableEnv.JWT_REFRESH_SECRET = 'test-refresh-secret';
    mutableEnv.JWT_ACCESS_TTL = '15m';
    mutableEnv.JWT_REFRESH_TTL = '7d';
    mutableEnv.SESSION_IDLE_TIMEOUT_MINUTES = 60;
    redis = memoryRedis();
    tokens = new TokenService(redis);
  });

  afterAll(() => {
    Object.assign(mutableEnv, original);
  });

  it('signs and verifies access tokens with typed claims', () => {
    const { token, claims } = tokens.signAccess(user, 'session-1');
    const verified = tokens.verifyAccess(token);

    expect(verified.sub).toBe(user.id);
    expect(verified.roles).toEqual(['USER']);
    expect(verified.sid).toBe('session-1');
    expect(verified.type).toBe('access');
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects a token signed with a different secret', () => {
    const { token } = tokens.signAccess(user, 'session-1');
    mutableEnv.JWT_SECRET = 'rotated-secret';
    expect(() => tokens.verifyAccess(token)).toThrow(UnauthorizedException);
  });

  it('rejects a refresh token presented as an access token', () => {
    const { token } = tokens.signRefresh(user, 'session-1', 'family-1');
    expect(() => tokens.verifyAccess(token)).toThrow(UnauthorizedException);
  });

  it('blacklists a jti and blocks strategy authentication', async () => {
    const { token, claims } = tokens.signAccess(user, 'session-1');
    await tokens.createSession(user);
    await tokens.blacklist(claims.jti, claims.exp);
    expect(await tokens.isBlacklisted(claims.jti)).toBe(true);
    await expect(new JwtStrategy(tokens).authenticate(token)).rejects.toThrow(
      'Session has been revoked',
    );
  });

  it('rotates refresh tokens and detects reuse by revoking the family', async () => {
    const first = await tokens.createSession(user);
    const second = await tokens.rotateRefresh(first.refreshToken, user);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.familyId).toBe(first.familyId);

    await expect(tokens.rotateRefresh(second.refreshToken, user)).resolves.toBeDefined();
    await expect(tokens.rotateRefresh(first.refreshToken, user)).rejects.toThrow(
      'Refresh token reuse detected',
    );
    await expect(tokens.rotateRefresh(second.refreshToken, user)).rejects.toThrow(
      'Refresh token has been revoked',
    );
  });

  it('lets only one concurrent refresh consume a token', async () => {
    const session = await tokens.createSession(user);
    const results = await Promise.allSettled([
      tokens.rotateRefresh(session.refreshToken, user),
      tokens.rotateRefresh(session.refreshToken, user),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      results.some(
        (result) =>
          result.status === 'rejected' &&
          String(result.reason).includes('Refresh token reuse detected'),
      ),
    ).toBe(true);
  });

  it('tracks sessions and enforces the idle window', async () => {
    const session = await tokens.createSession(user);
    await expect(tokens.listSessions(user.id)).resolves.toEqual([
      expect.objectContaining({ id: session.sessionId }),
    ]);
    expect(await tokens.touchSession(session.sessionId)).toBe(true);
    expect(await tokens.revokeSession(user.id, session.sessionId)).toBe(true);
    expect(await tokens.touchSession(session.sessionId)).toBe(false);
    expect(await tokens.listSessions(user.id)).toEqual([]);
  });

  it('uses verification and reset tokens exactly once', async () => {
    const verification = await tokens.issueVerificationToken(user.id);
    expect(await tokens.consumeVerificationToken(verification)).toBe(user.id);
    expect(await tokens.consumeVerificationToken(verification)).toBeNull();

    const reset = await tokens.issueResetToken(user.id);
    expect(await tokens.consumeResetToken(reset)).toBe(user.id);
    expect(await tokens.consumeResetToken(reset)).toBeNull();
  });

  it('consumes a single-use token only once under concurrent requests', async () => {
    const verification = await tokens.issueVerificationToken(user.id);
    const results = await Promise.all([
      tokens.consumeVerificationToken(verification),
      tokens.consumeVerificationToken(verification),
    ]);

    expect(results.filter((value) => value === user.id)).toHaveLength(1);
    expect(results).toContain(null);
  });

  it('never stores raw single-use tokens as keys', async () => {
    const token = await tokens.issueResetToken(user.id);
    const keys = await redis.scanKeys('reset:*');
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain(token);
  });
});
