import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Controller, Get } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { ValidationPipe } from '@nestjs/common';
import { env } from '@ts/config';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@ts/types';
import { PrismaClient, type Role } from '@ts/database';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { CommonModule } from '../../common/common.module';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { CookieAuthGuard } from '../../common/guards/cookie-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/public';
import { Roles } from '../../common/decorators/roles';
import { LoggingInterceptor } from '../../common/interceptors/logging.interceptor';
import { RequestIdInterceptor } from '../../common/interceptors/request-id.interceptor';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import { createValidationPipe } from '../../config/validation';
import { JsonLogger } from '../../common/logger/json-logger';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisModule } from '../redis/redis.module';
import { RedisService } from '../redis/redis.service';
import { AuthModule } from './auth.module';
import { PasswordService } from './password.service';
import { UsersModule } from '../users/users.module';

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://tradesense:tradesense@localhost:5433/tradesense_test';

@Controller('probe')
class ProbeController {
  @Public()
  @Get('public')
  public(): { ok: boolean } {
    return { ok: true };
  }

  @Get('any')
  any(): { scope: string } {
    return { scope: 'any' };
  }

  @Roles('ADMIN')
  @Get('admin')
  admin(): { scope: string } {
    return { scope: 'admin' };
  }

  @Roles('ANALYST')
  @Get('analyst')
  analyst(): { scope: string } {
    return { scope: 'analyst' };
  }
}

interface LoginBody {
  tokens: { accessToken: string; refreshToken: string };
}

/** Isolated Redis double: auth state is exercised without external services. */
function memoryRedis(): RedisService {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  return {
    ensureConnected: jest.fn(async () => undefined),
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
      for (const key of keys) {
        if (values.delete(key)) removed += 1;
        if (sets.delete(key)) removed += 1;
      }
      return removed;
    }),
    exists: jest.fn(async (key: string) => values.has(key) || sets.has(key)),
    expire: jest.fn(async () => undefined),
    ttl: jest.fn(async () => 60),
    incrWithTtl: jest.fn(async (key: string) => {
      const next = Number(values.get(key) ?? 0) + 1;
      values.set(key, String(next));
      return next;
    }),
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
    onModuleDestroy: jest.fn(async () => undefined),
  } as unknown as RedisService;
}

describe('P06 auth integration', () => {
  const mutableEnv = env as unknown as Record<string, unknown>;
  const original = { ...mutableEnv };
  let app: INestApplication;
  let prisma: PrismaClient;
  let loggerSpy: jest.SpiedFunction<
    (message: unknown, context?: string, extra?: Record<string, unknown>) => void
  >;
  const createdUserIds: string[] = [];

  async function createVerifiedUser(role: Role): Promise<{ email: string; password: string }> {
    const email = `${role.toLowerCase()}-${randomUUID()}@example.com`;
    const password = 'Integration-Pass-123';
    const passwordHash = await new PasswordService().hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, role, emailVerifiedAt: new Date() },
    });
    createdUserIds.push(user.id);
    return { email, password };
  }

  async function login(email: string, password: string): Promise<LoginBody> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.data as LoginBody;
  }

  async function issuedTokenFor(role: Role): Promise<string> {
    const account = await createVerifiedUser(role);
    return (await login(account.email, account.password)).tokens.accessToken;
  }

  beforeAll(async () => {
    mutableEnv.JWT_SECRET = 'integration-access-secret';
    mutableEnv.JWT_REFRESH_SECRET = 'integration-refresh-secret';
    mutableEnv.JWT_ACCESS_TTL = '15m';
    mutableEnv.JWT_REFRESH_TTL = '7d';
    mutableEnv.REFRESH_COOKIE_NAME = 'ts_refresh';
    mutableEnv.REFRESH_COOKIE_SECURE = false;
    mutableEnv.BCRYPT_ROUNDS = 10;
    mutableEnv.RATE_LIMIT_AUTH_MAX = 1000;
    loggerSpy = jest.spyOn(JsonLogger.prototype, 'log').mockImplementation(() => undefined);
    prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule, PrismaModule, RedisModule, AuthModule, UsersModule],
      controllers: [ProbeController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: CookieAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
        { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
        { provide: APP_PIPE, useFactory: (): ValidationPipe => createValidationPipe() },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({
        getClient: () => prisma,
        onModuleInit: async () => undefined,
        onModuleDestroy: async () => undefined,
      })
      .overrideProvider(RedisService)
      .useValue(memoryRedis())
      .compile();

    app = moduleRef.createNestApplication();
    app
      .getHttpAdapter()
      .getInstance()
      .set('trust proxy', Number(env.TRUST_PROXY ?? 1));
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
      for (const id of createdUserIds) {
        await prisma.riskProfile.deleteMany({ where: { userId: id } });
        await prisma.userProfile.deleteMany({ where: { userId: id } });
        await prisma.user.deleteMany({ where: { id } });
      }
      await prisma.$disconnect();
    }
    if (app) await app.close();
    loggerSpy?.mockRestore();
    Object.assign(mutableEnv, original);
  }, 120_000);

  it('registers a user with profile, default risk profile and audit entry', async () => {
    const email = `register-${randomUUID()}@example.com`;
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Register-Pass-123', name: 'Ada Lovelace' })
      .expect(201);

    expect(response.body.data).toEqual({
      message: 'Account created. Verify your email before signing in.',
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { profile: true, riskProfile: true },
    });
    createdUserIds.push(user.id);
    expect(user.passwordHash).not.toContain('Register-Pass-123');
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.profile?.firstName).toBe('Ada');
    expect(user.riskProfile?.profileType).toBe('MODERATE');
    await expect(
      prisma.auditLog.findFirst({ where: { userId: user.id, action: 'REGISTER' } }),
    ).resolves.not.toBeNull();
  });

  it('blocks unverified users and verifies them via the dev link', async () => {
    const email = `verify-${randomUUID()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Verify-Pass-123' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Verify-Pass-123' })
      .expect(403);

    const call = loggerSpy.mock.calls.find((args) =>
      String(args[0]).includes('verification.dev-link'),
    );
    expect(call).toBeDefined();
    const link = (call?.[2] as { link: string }).link;
    const token = new URL(link).searchParams.get('token');
    expect(token).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Verify-Pass-123' })
      .expect(200);
  });

  it('rejects a wrong password with 401 and enforces the envelopes', async () => {
    const account = await createVerifiedUser('USER');
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: 'definitely-wrong' })
      .expect(401);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED', requestId: expect.any(String) },
    });
    expect(response.body.error.message).not.toMatch(/at\s+\S+\s+\(/);
  });

  it('issues a rotating refresh cookie and revokes it on logout', async () => {
    const account = await createVerifiedUser('USER');
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: account.password })
      .expect(200);

    const cookies = loginResponse.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies?.join(' ')).toContain('ts_refresh=');
    expect(cookies?.join(' ')).toContain('HttpOnly');
    expect(cookies?.join(' ')).toContain('SameSite=Strict');

    const setCookies = (response: { headers: Record<string, unknown> }): string[] =>
      (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    const cookiesOf = (response: { headers: Record<string, unknown> }): string =>
      setCookies(response)
        .map((cookie) => cookie.split(';')[0])
        .join('; ');
    const csrfOf = (response: { headers: Record<string, unknown> }): string =>
      setCookies(response)
        .find((cookie) => cookie.startsWith(`${CSRF_COOKIE_NAME}=`))
        ?.split(';')[0]
        .split('=')[1] ?? '';
    const { tokens } = loginResponse.body.data as LoginBody;

    // A refresh token in the body is deliberately ignored.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set(CSRF_HEADER_NAME, csrfOf(loginResponse))
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);

    // A valid refresh cookie without the matching CSRF header is rejected.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookiesOf(loginResponse))
      .expect(403);

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookiesOf(loginResponse))
      .set(CSRF_HEADER_NAME, csrfOf(loginResponse))
      .expect(200);
    const rotated = refreshResponse.body.data.tokens.refreshToken as string;
    expect(rotated).not.toBe(tokens.refreshToken);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookiesOf(loginResponse))
      .set(CSRF_HEADER_NAME, csrfOf(loginResponse))
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookiesOf(refreshResponse))
      .set(CSRF_HEADER_NAME, csrfOf(refreshResponse))
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookiesOf(refreshResponse))
      .set(CSRF_HEADER_NAME, csrfOf(refreshResponse))
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(401);
  });

  it('rejects expired or other-secret access tokens', async () => {
    const forged = sign({ sub: 'someone', roles: ['USER'] }, 'not-the-api-secret', {
      expiresIn: 60,
    });
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('enforces the global RBAC matrix', async () => {
    await request(app.getHttpServer()).get('/api/v1/probe/public').expect(200);
    await request(app.getHttpServer()).get('/api/v1/probe/any').expect(401);

    const userToken = await issuedTokenFor('USER');
    const adminToken = await issuedTokenFor('ADMIN');
    const analystToken = await issuedTokenFor('ANALYST');

    await request(app.getHttpServer())
      .get('/api/v1/probe/any')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/probe/admin')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/probe/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/probe/admin')
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/probe/analyst')
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/probe/analyst')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('serves and updates user-owned settings', async () => {
    const account = await createVerifiedUser('USER');
    const { tokens } = await login(account.email, account.password);
    const auth = { Authorization: `Bearer ${tokens.accessToken}` };

    const me = await request(app.getHttpServer()).get('/api/v1/users/me').set(auth).expect(200);
    expect(me.body.data.email).toBe(account.email);
    expect(me.body.data.riskProfile).toBeNull();

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set(auth)
      .send({ timezone: 'Europe/Amsterdam' })
      .expect(200);
    const updated = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set(auth)
      .expect(200);
    expect(updated.body.data.profile.timezone).toBe('Europe/Amsterdam');

    await request(app.getHttpServer())
      .patch('/api/v1/users/me/risk-profile')
      .set(auth)
      .send({ riskPerTradePct: 0.5 })
      .expect(200);
    const risk = await request(app.getHttpServer())
      .get('/api/v1/users/me/risk-profile')
      .set(auth)
      .expect(200);
    expect(risk.body.data.riskPerTradePct).toBe(0.5);

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set(auth)
      .send({ timezone: 'UTC', role: 'ADMIN' })
      .expect(422);
  });

  it('returns a documented 501 for MFA setup', async () => {
    const token = await issuedTokenFor('USER');
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/setup')
      .set('Authorization', `Bearer ${token}`)
      .expect(501);
    expect(response.body.error.code).toBe('NOT_IMPLEMENTED');
  });

  it('rate-limits auth requests with a 429 envelope', async () => {
    mutableEnv.RATE_LIMIT_AUTH_MAX = 2;
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: 'none@example.com', password: 'wrong-password' });

    await attempt().expect(401);
    await attempt().expect(401);
    const limited = await attempt().expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
