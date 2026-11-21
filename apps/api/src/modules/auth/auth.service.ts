import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import { env } from '@ts/config';
import type {
  Prisma,
  RiskProfile as RiskProfileRow,
  RiskProfileType,
  User,
  UserProfile,
} from '@ts/database';
import type {
  AuthTokens,
  MessageResponse,
  SessionInfo,
  UpdateProfileInput,
  UpdateRiskProfileInput,
  UserView,
} from '@ts/types';
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@ts/validation';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email/email.service';
import { PasswordService } from './password.service';
import { TokenService, type AuthUser, type IssuedTokens } from './token.service';

/** Constant dummy hash keeps the "user not found" path timing-similar. */
const DUMMY_HASH = '$2b$12$xXMszhu5jitsObeMZTi1T.weo/sF.kSJotlHWFC3JB076IYrRvEv.';

export interface RequestContext {
  actorId?: string;
  ip?: string;
  requestId?: string;
}

type UserWithRelations = User & { profile: UserProfile | null; riskProfile: RiskProfileRow | null };

const USER_INCLUDE = { profile: true, riskProfile: true } as const satisfies Prisma.UserInclude;

function decimal(value: Prisma.Decimal | null): number | undefined {
  return value === null ? undefined : Number(value);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.getClient();
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private authUser(user: User): AuthUser {
    return { id: user.id, email: user.email, roles: [user.role as AuthUser['roles'][number]] };
  }

  private toUserView(user: UserWithRelations): UserView {
    return {
      id: user.id,
      email: user.email,
      role: user.role as UserView['role'],
      emailVerified: user.emailVerifiedAt !== null,
      mfaEnabled: user.mfaEnabled,
      profile: user.profile
        ? {
            firstName: user.profile.firstName,
            lastName: user.profile.lastName,
            timezone: user.profile.timezone,
            baseCurrency: user.profile.baseCurrency,
            experienceLevel: user.profile.experienceLevel,
            avatarUrl: user.profile.avatarUrl,
          }
        : null,
      riskProfile: user.riskProfile
        ? {
            name: user.riskProfile.name,
            profileType: user.riskProfile.profileType,
            riskPerTradePct: Number(user.riskProfile.riskPerTradePct),
            maxOpenPositions: user.riskProfile.maxOpenPositions,
            maxDailyLossPct: Number(user.riskProfile.maxDailyLossPct),
            minRiskReward: Number(user.riskProfile.minRiskReward),
            maxPortfolioExposurePct: decimal(user.riskProfile.maxPortfolioExposurePct),
            maxDrawdownPct: decimal(user.riskProfile.maxDrawdownPct),
            maxVolatility: decimal(user.riskProfile.maxVolatilityPct),
            newsEventRestrictions: user.riskProfile.newsEventRestriction,
          }
        : null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private tokenPair(issued: IssuedTokens): AuthTokens {
    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      tokenType: 'Bearer',
      expiresIn: issued.accessExpiresAt - Math.floor(Date.now() / 1000),
      refreshExpiresIn: issued.refreshExpiresAt - Math.floor(Date.now() / 1000),
      sessionId: issued.sessionId,
    };
  }

  private async findUser(userId: string): Promise<UserWithRelations> {
    const user = await this.db.user.findUnique({ where: { id: userId }, include: USER_INCLUDE });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return user;
  }

  // ───────────────────────────── registration ─────────────────────────────

  async register(input: RegisterInput, context: RequestContext = {}): Promise<MessageResponse> {
    const email = this.normalizeEmail(input.email);
    const existing = await this.db.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await this.passwords.hashPassword(input.password);
    const profileType = String(env.DEFAULT_RISK_PROFILE) as
      'MODERATE' | 'CONSERVATIVE' | 'AGGRESSIVE';
    const [firstName, ...rest] = (input.name ?? '').trim().split(/\s+/);
    const lastName = rest.join(' ');

    const user = await this.db.user.create({
      data: {
        email,
        passwordHash,
        profile: {
          create: {
            firstName: firstName || null,
            lastName: lastName || null,
          },
        },
        riskProfile: {
          create: {
            name: profileType,
            profileType,
            riskPerTradePct: env.DEFAULT_RISK_PER_TRADE_PCT,
            maxOpenPositions: env.MAX_OPEN_POSITIONS,
            maxDailyLossPct: env.MAX_DAILY_LOSS_PCT,
            minRiskReward: env.MIN_RISK_REWARD_RATIO,
            maxPortfolioExposurePct: 30,
            maxDrawdownPct: 10,
            maxVolatilityPct: 20,
            newsEventRestriction: true,
          },
        },
      },
    });

    const token = await this.tokens.issueVerificationToken(user.id);
    const base = String(env.NEXT_PUBLIC_APP_URL).replace(/\/$/, '');
    await this.email.sendVerification(email, `${base}/verify-email?token=${token}`);

    await this.audit.record({
      actorId: user.id,
      action: 'REGISTER',
      entity: 'User',
      entityId: user.id,
      metadata: { email },
      requestId: context.requestId ?? randomUUID(),
      ip: context.ip,
    });

    return { message: 'Account created. Verify your email before signing in.' };
  }

  async verifyEmail(token: string): Promise<MessageResponse> {
    const userId = await this.tokens.consumeVerificationToken(token);
    if (!userId) throw new BadRequestException('Verification token is invalid or expired');
    await this.db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    return { message: 'Email verified. You can now sign in.' };
  }

  // ───────────────────────────── login ─────────────────────────────

  async login(
    input: LoginInput,
    context: RequestContext = {},
  ): Promise<{
    user: UserView;
    tokens: AuthTokens;
  }> {
    const email = this.normalizeEmail(input.email);
    const user = await this.db.user.findUnique({ where: { email } });
    const valid = await this.passwords.verify(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    if (!user.isActive) throw new ForbiddenException('Account is disabled');
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Email is not verified');
    }

    const issued = await this.tokens.createSession(this.authUser(user));
    await this.audit.record({
      actorId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      metadata: { method: 'password' },
      requestId: context.requestId ?? randomUUID(),
      ip: context.ip,
    });

    return {
      user: this.toUserView(await this.findUser(user.id)),
      tokens: this.tokenPair(issued),
    };
  }

  async refresh(refreshToken: string): Promise<{ user: UserView; tokens: AuthTokens }> {
    const claims = this.tokens.verifyRefresh(refreshToken);
    const user = await this.findUser(claims.sub);
    if (!user.isActive) throw new ForbiddenException('Account is disabled');
    const issued = await this.tokens.rotateRefresh(refreshToken, this.authUser(user));
    return {
      user: this.toUserView(user),
      tokens: this.tokenPair(issued),
    };
  }

  async logout(
    refreshToken: string | undefined,
    context: RequestContext = {},
  ): Promise<MessageResponse> {
    if (refreshToken) {
      try {
        const claims = this.tokens.verifyRefresh(refreshToken);
        await this.tokens.revokeSession(claims.sub, claims.sid);
      } catch {
        // An expired or already-rotated cookie still results in a clean logout.
      }
    }
    await this.audit.record({
      actorId: context.actorId,
      action: 'LOGOUT',
      entity: 'User',
      metadata: { reason: 'user-request' },
      requestId: context.requestId ?? randomUUID(),
      ip: context.ip,
    });
    return { message: 'Signed out.' };
  }

  // ───────────────────────────── password reset ─────────────────────────────

  async forgotPassword(
    input: ForgotPasswordInput,
    context: RequestContext = {},
  ): Promise<MessageResponse> {
    const email = this.normalizeEmail(input.email);
    const user = await this.db.user.findUnique({ where: { email } });
    if (user) {
      const token = await this.tokens.issueResetToken(user.id);
      const base = String(env.NEXT_PUBLIC_APP_URL).replace(/\/$/, '');
      await this.email.sendPasswordReset(email, `${base}/reset-password?token=${token}`);
      await this.audit.record({
        actorId: user.id,
        action: 'SETTINGS_CHANGE',
        entity: 'User',
        entityId: user.id,
        metadata: { kind: 'password-reset-requested' },
        requestId: context.requestId ?? randomUUID(),
        ip: context.ip,
      });
    }
    return { message: 'If the account exists, a reset link has been sent.' };
  }

  async resetPassword(
    input: ResetPasswordInput,
    context: RequestContext = {},
  ): Promise<MessageResponse> {
    const userId = await this.tokens.consumeResetToken(input.token);
    if (!userId) throw new BadRequestException('Reset token is invalid or expired');
    const passwordHash = await this.passwords.hashPassword(input.password);
    await this.db.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.tokens.revokeAllSessions(userId);
    await this.audit.record({
      actorId: userId,
      action: 'SETTINGS_CHANGE',
      entity: 'User',
      entityId: userId,
      metadata: { kind: 'password-reset-completed' },
      requestId: context.requestId ?? randomUUID(),
      ip: context.ip,
    });
    return { message: 'Password updated. Please sign in again.' };
  }

  // ───────────────────────────── users / settings ─────────────────────────────

  async me(userId: string): Promise<UserView> {
    return this.toUserView(await this.findUser(userId));
  }

  async updateMe(
    userId: string,
    input: UpdateProfileInput,
    context: RequestContext = {},
  ): Promise<UserView> {
    const data: Prisma.UserProfileUncheckedUpdateInput = {};
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.timezone !== undefined) data.timezone = input.timezone;
    if (input.baseCurrency !== undefined) data.baseCurrency = input.baseCurrency;
    if (input.experienceLevel !== undefined) data.experienceLevel = input.experienceLevel;
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;

    await this.db.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        timezone: input.timezone ?? 'UTC',
        baseCurrency: input.baseCurrency ?? 'USD',
        experienceLevel: input.experienceLevel ?? 'BEGINNER',
        avatarUrl: input.avatarUrl ?? null,
      },
      update: data,
    });
    await this.recordSettings(userId, { kind: 'profile-updated' }, context);
    return this.toUserView(await this.findUser(userId));
  }

  async riskProfile(userId: string): Promise<UserView['riskProfile']> {
    return this.toUserView(await this.findUser(userId)).riskProfile;
  }

  async updateRiskProfile(
    userId: string,
    input: UpdateRiskProfileInput,
    context: RequestContext = {},
  ): Promise<UserView['riskProfile']> {
    const data: Prisma.RiskProfileUpdateInput = {};
    if (input.profileType !== undefined) {
      data.profileType = input.profileType as RiskProfileType;
    }
    if (input.riskPerTradePct !== undefined) data.riskPerTradePct = input.riskPerTradePct;
    if (input.maxOpenPositions !== undefined) data.maxOpenPositions = input.maxOpenPositions;
    if (input.maxDailyLossPct !== undefined) data.maxDailyLossPct = input.maxDailyLossPct;
    if (input.minRiskReward !== undefined) data.minRiskReward = input.minRiskReward;
    if (input.maxPortfolioExposurePct !== undefined) {
      data.maxPortfolioExposurePct = input.maxPortfolioExposurePct;
    }
    if (input.maxDrawdownPct !== undefined) data.maxDrawdownPct = input.maxDrawdownPct;
    if (input.maxVolatility !== undefined) data.maxVolatilityPct = input.maxVolatility;
    if (input.newsEventRestrictions !== undefined) {
      data.newsEventRestriction = input.newsEventRestrictions;
    }

    const existing = await this.db.riskProfile.findUnique({ where: { userId } });
    if (existing) {
      await this.db.riskProfile.update({ where: { userId }, data });
    } else {
      await this.db.riskProfile.create({
        data: {
          userId,
          name: String(input.profileType ?? env.DEFAULT_RISK_PROFILE),
          profileType: (input.profileType ?? env.DEFAULT_RISK_PROFILE) as RiskProfileType,
          riskPerTradePct: input.riskPerTradePct ?? env.DEFAULT_RISK_PER_TRADE_PCT,
          maxOpenPositions: input.maxOpenPositions ?? env.MAX_OPEN_POSITIONS,
          maxDailyLossPct: input.maxDailyLossPct ?? env.MAX_DAILY_LOSS_PCT,
          minRiskReward: input.minRiskReward ?? env.MIN_RISK_REWARD_RATIO,
          maxPortfolioExposurePct: input.maxPortfolioExposurePct ?? 30,
          maxDrawdownPct: input.maxDrawdownPct ?? 10,
          maxVolatilityPct: input.maxVolatility ?? 20,
        },
      });
    }
    await this.recordSettings(userId, { kind: 'risk-profile-updated' }, context);
    return this.toUserView(await this.findUser(userId)).riskProfile;
  }

  async sessions(userId: string): Promise<SessionInfo[]> {
    return this.tokens.listSessions(userId);
  }

  async revokeSession(userId: string, sessionId: string): Promise<MessageResponse> {
    const revoked = await this.tokens.revokeSession(userId, sessionId);
    if (!revoked) throw new BadRequestException('Session not found');
    return { message: 'Session revoked.' };
  }

  private async recordSettings(
    userId: string,
    metadata: Record<string, unknown>,
    context: RequestContext,
  ): Promise<void> {
    await this.audit.record({
      actorId: userId,
      action: 'SETTINGS_CHANGE',
      entity: 'User',
      entityId: userId,
      metadata,
      requestId: context.requestId ?? randomUUID(),
      ip: context.ip,
    });
  }

  /** Documented extension point — intentionally not a fake MFA implementation. */
  mfaSetup(): never {
    throw new NotImplementedException({
      code: 'NOT_IMPLEMENTED',
      message: 'MFA enrollment is not implemented. See README §19.1 for the extension point.',
    });
  }
}
