import { Injectable, UnauthorizedException } from '@nestjs/common';
import { env } from '@ts/config';
import type { Role } from '@ts/database';
import { createHash, randomUUID } from 'node:crypto';
import { decode, sign, verify } from 'jsonwebtoken';
import { RedisService } from '../redis/redis.service';

const ISSUER = 'tradesense';
const AUDIENCE = 'tradesense-api';
const ACCESS_TYPE = 'access';
const REFRESH_TYPE = 'refresh';

/** Fields shared by both token families. */
interface BaseClaims {
  sub: string;
  email: string;
  roles: Role[];
  sid: string;
  jti: string;
  type: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export type AccessClaims = BaseClaims & { type: typeof ACCESS_TYPE };
export type RefreshClaims = BaseClaims & { type: typeof REFRESH_TYPE; fam: string };

export interface AuthUser {
  id: string;
  email: string;
  roles: Role[];
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  familyId: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

export interface SessionMeta {
  userId: string;
  familyId: string;
  accessJti: string;
  refreshJti: string;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
}

export interface SessionView {
  id: string;
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
}

interface RefreshRecord {
  userId: string;
  sessionId: string;
  familyId: string;
}

/**
 * P06 token lifecycle. Access tokens are short-lived bearer credentials;
 * refresh tokens live in an httpOnly cookie and rotate on every use. Redis
 * holds all revocation/session state so the API stays horizontally scalable.
 */
@Injectable()
export class TokenService {
  constructor(private readonly redis: RedisService) {}

  private get accessSecret(): string {
    return String(env.JWT_SECRET ?? '');
  }

  private get refreshSecret(): string {
    return String(env.JWT_REFRESH_SECRET ?? this.accessSecret);
  }

  private expiresIn(ttl: string, kind: 'access' | 'refresh'): number {
    const now = Math.floor(Date.now() / 1000);
    const match = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!match) {
      throw new UnauthorizedException(`Invalid ${kind} TTL configuration`);
    }
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return now + Number(match[1]) * multipliers[match[2]];
  }

  private ttlSeconds(expiresAt: number): number {
    return Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
  }

  private requireSecrets(): void {
    if (!this.accessSecret || !this.refreshSecret) {
      throw new UnauthorizedException('JWT secrets are not configured');
    }
  }

  // ───────────────────────────── signing & verification ─────────────────────────────

  signAccess(
    user: AuthUser,
    sessionId: string,
    jti = randomUUID(),
  ): { token: string; claims: AccessClaims } {
    this.requireSecrets();
    const expiresAt = this.expiresIn(String(env.JWT_ACCESS_TTL), 'access');
    const token = sign(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles,
        sid: sessionId,
        type: ACCESS_TYPE,
      },
      this.accessSecret,
      {
        algorithm: 'HS256',
        expiresIn: this.ttlSeconds(expiresAt),
        issuer: ISSUER,
        audience: AUDIENCE,
        jwtid: jti,
      },
    );
    const claims = this.decodeClaims<AccessClaims>(token);
    return { token, claims: { ...claims, type: ACCESS_TYPE } };
  }

  signRefresh(
    user: AuthUser,
    sessionId: string,
    familyId: string,
    jti = randomUUID(),
  ): { token: string; claims: RefreshClaims } {
    this.requireSecrets();
    const expiresAt = this.expiresIn(String(env.JWT_REFRESH_TTL), 'refresh');
    const token = sign(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles,
        sid: sessionId,
        fam: familyId,
        type: REFRESH_TYPE,
      },
      this.refreshSecret,
      {
        algorithm: 'HS256',
        expiresIn: this.ttlSeconds(expiresAt),
        issuer: ISSUER,
        audience: AUDIENCE,
        jwtid: jti,
      },
    );
    const claims = this.decodeClaims<RefreshClaims>(token);
    return { token, claims: { ...claims, type: REFRESH_TYPE } };
  }

  private decodeClaims<T extends BaseClaims>(token: string): T {
    const payload = decode(token) as T | null;
    if (!payload || typeof payload.exp !== 'number') {
      throw new UnauthorizedException('Malformed token');
    }
    return payload;
  }

  verifyAccess(token: string): AccessClaims {
    this.requireSecrets();
    try {
      const payload = verify(token, this.accessSecret, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
      }) as unknown as AccessClaims;
      if (payload.type !== ACCESS_TYPE || !payload.sub || !payload.jti) {
        throw new Error('Wrong token type');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  verifyRefresh(token: string): RefreshClaims {
    this.requireSecrets();
    try {
      const payload = verify(token, this.refreshSecret, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
      }) as unknown as RefreshClaims;
      if (payload.type !== REFRESH_TYPE || !payload.sub || !payload.jti || !payload.fam) {
        throw new Error('Wrong token type');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  // ───────────────────────────── Redis key helpers ─────────────────────────────

  private blacklistKey(jti: string): string {
    return `session:${jti}`;
  }

  private refreshKey(jti: string): string {
    return `refresh:${jti}`;
  }

  private familyKey(familyId: string): string {
    return `refresh:family:${familyId}`;
  }

  private sessionKey(sessionId: string): string {
    return `session:meta:${sessionId}`;
  }

  private userSessionsKey(userId: string): string {
    return `user:${userId}:sessions`;
  }

  private verificationKey(tokenHash: string): string {
    return `verify:${tokenHash}`;
  }

  private resetKey(tokenHash: string): string {
    return `reset:${tokenHash}`;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // ───────────────────────────── blacklist ─────────────────────────────

  async blacklist(jti: string, expiresAt: number): Promise<void> {
    await this.redis.set(this.blacklistKey(jti), '1', this.ttlSeconds(expiresAt));
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    return this.redis.exists(this.blacklistKey(jti));
  }

  // ───────────────────────────── sessions ─────────────────────────────

  async createSession(user: AuthUser): Promise<IssuedTokens> {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const access = this.signAccess(user, sessionId);
    const refresh = this.signRefresh(user, sessionId, familyId);
    const idleSeconds = Number(env.SESSION_IDLE_TIMEOUT_MINUTES) * 60;
    const now = Math.floor(Date.now() / 1000);
    const meta: SessionMeta = {
      userId: user.id,
      familyId,
      accessJti: access.claims.jti,
      refreshJti: refresh.claims.jti,
      createdAt: now,
      lastActivity: now,
      expiresAt: now + idleSeconds,
    };

    await this.redis.set(this.sessionKey(sessionId), JSON.stringify(meta), idleSeconds);
    await this.redis.addToSet(this.userSessionsKey(user.id), sessionId);
    await this.redis.set(
      this.refreshKey(refresh.claims.jti),
      JSON.stringify({ userId: user.id, sessionId, familyId } satisfies RefreshRecord),
      this.ttlSeconds(refresh.claims.exp),
    );
    await this.redis.addToSet(this.familyKey(familyId), refresh.claims.jti);
    await this.redis.expire(this.familyKey(familyId), this.ttlSeconds(refresh.claims.exp));

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      sessionId,
      familyId,
      accessExpiresAt: access.claims.exp,
      refreshExpiresAt: refresh.claims.exp,
    };
  }

  async getSession(sessionId: string): Promise<SessionMeta | null> {
    const raw = await this.redis.get(this.sessionKey(sessionId));
    return raw ? (JSON.parse(raw) as SessionMeta) : null;
  }

  /** Extends the idle window on each authenticated request. */
  async touchSession(sessionId: string): Promise<boolean> {
    const meta = await this.getSession(sessionId);
    if (!meta) return false;
    const now = Math.floor(Date.now() / 1000);
    const idleSeconds = Number(env.SESSION_IDLE_TIMEOUT_MINUTES) * 60;
    meta.lastActivity = now;
    meta.expiresAt = now + idleSeconds;
    await this.redis.set(this.sessionKey(sessionId), JSON.stringify(meta), idleSeconds);
    return true;
  }

  async listSessions(userId: string): Promise<SessionView[]> {
    const ids = await this.redis.membersOfSet(this.userSessionsKey(userId));
    const sessions: SessionView[] = [];
    for (const id of ids) {
      const meta = await this.getSession(id);
      if (!meta) continue;
      sessions.push({
        id,
        createdAt: new Date(meta.createdAt * 1000).toISOString(),
        lastActivity: new Date(meta.lastActivity * 1000).toISOString(),
        expiresAt: new Date(meta.expiresAt * 1000).toISOString(),
      });
    }
    return sessions.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
  }

  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    const meta = await this.getSession(sessionId);
    if (!meta || meta.userId !== userId) return false;
    await this.blacklist(meta.accessJti, meta.expiresAt);
    await this.redis.del(
      this.sessionKey(sessionId),
      this.refreshKey(meta.refreshJti),
      this.blacklistKey(meta.refreshJti),
    );
    await this.redis.removeFromSet(this.userSessionsKey(userId), sessionId);
    await this.redis.removeFromSet(this.familyKey(meta.familyId), meta.refreshJti);
    return true;
  }

  async revokeAllSessions(userId: string): Promise<void> {
    const ids = await this.redis.membersOfSet(this.userSessionsKey(userId));
    for (const id of ids) await this.revokeSession(userId, id);
  }

  // ───────────────────────────── refresh rotation ─────────────────────────────

  async rotateRefresh(token: string, user: AuthUser): Promise<IssuedTokens> {
    const claims = this.verifyRefresh(token);
    if (claims.sub !== user.id) throw new UnauthorizedException('Refresh token owner mismatch');

    const oldKey = this.refreshKey(claims.jti);
    const stored = await this.redis.get(oldKey);
    if (!stored) {
      // A rotated token was replayed: kill the whole family.
      if (await this.redis.exists(this.familyKey(claims.fam))) {
        await this.revokeFamily(claims.fam);
        throw new UnauthorizedException('Refresh token reuse detected; session family revoked');
      }
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const record = JSON.parse(stored) as RefreshRecord;
    if (
      record.userId !== user.id ||
      record.familyId !== claims.fam ||
      record.sessionId !== claims.sid
    ) {
      throw new UnauthorizedException('Refresh token record mismatch');
    }

    // Burn the previous jti before issuing its replacement (atomic rotation).
    await this.redis.del(oldKey);
    await this.redis.removeFromSet(this.familyKey(claims.fam), claims.jti);

    const access = this.signAccess(user, claims.sid);
    const refresh = this.signRefresh(user, claims.sid, claims.fam);
    await this.redis.set(
      this.refreshKey(refresh.claims.jti),
      JSON.stringify(record satisfies RefreshRecord),
      this.ttlSeconds(refresh.claims.exp),
    );
    await this.redis.addToSet(this.familyKey(claims.fam), refresh.claims.jti);
    await this.redis.expire(this.familyKey(claims.fam), this.ttlSeconds(refresh.claims.exp));

    const meta = await this.getSession(claims.sid);
    if (meta) {
      meta.accessJti = access.claims.jti;
      meta.refreshJti = refresh.claims.jti;
      await this.redis.set(
        this.sessionKey(claims.sid),
        JSON.stringify(meta),
        this.ttlSeconds(meta.expiresAt),
      );
    }

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      sessionId: claims.sid,
      familyId: claims.fam,
      accessExpiresAt: access.claims.exp,
      refreshExpiresAt: refresh.claims.exp,
    };
  }

  async revokeFamily(familyId: string): Promise<void> {
    const jtis = await this.redis.membersOfSet(this.familyKey(familyId));
    for (const jti of jtis) await this.redis.del(this.refreshKey(jti));
    const sessions = await this.redis.scanKeys('session:meta:*');
    for (const key of sessions) {
      const raw = await this.redis.get(key);
      if (!raw) continue;
      const meta = JSON.parse(raw) as SessionMeta;
      if (meta.familyId !== familyId) continue;
      const sessionId = key.slice('session:meta:'.length);
      await this.blacklist(meta.accessJti, meta.expiresAt);
      await this.redis.del(key);
      await this.redis.removeFromSet(this.userSessionsKey(meta.userId), sessionId);
    }
    await this.redis.deleteSet(this.familyKey(familyId));
  }

  // ───────────────────── single-use verification / reset tokens ─────────────────────

  async issueVerificationToken(userId: string, ttlSeconds = 3600): Promise<string> {
    const token = randomUUID();
    await this.redis.set(
      this.verificationKey(this.hashToken(token)),
      JSON.stringify({ userId }),
      ttlSeconds,
    );
    return token;
  }

  async consumeVerificationToken(token: string): Promise<string | null> {
    const key = this.verificationKey(this.hashToken(token));
    const raw = await this.redis.get(key);
    if (!raw) return null;
    await this.redis.del(key);
    return (JSON.parse(raw) as { userId: string }).userId;
  }

  async issueResetToken(userId: string, ttlSeconds = 900): Promise<string> {
    const token = randomUUID();
    await this.redis.set(
      this.resetKey(this.hashToken(token)),
      JSON.stringify({ userId }),
      ttlSeconds,
    );
    return token;
  }

  async consumeResetToken(token: string): Promise<string | null> {
    const key = this.resetKey(this.hashToken(token));
    const raw = await this.redis.get(key);
    if (!raw) return null;
    await this.redis.del(key);
    return (JSON.parse(raw) as { userId: string }).userId;
  }
}
