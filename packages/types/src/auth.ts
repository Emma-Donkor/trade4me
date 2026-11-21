import type { RiskProfile } from './risk';

/** P06 identity contracts shared by the API and the web auth pages. */
export type Role = 'USER' | 'ANALYST' | 'ADMIN';

export interface AuthUserView {
  id: string;
  email: string;
  roles: Role[];
  sid?: string;
  jti?: string;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
  sessionId: string;
}

export interface UserProfileView {
  firstName: string | null;
  lastName: string | null;
  timezone: string;
  baseCurrency: string;
  experienceLevel: string;
  avatarUrl: string | null;
}

export interface UserView {
  id: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  mfaEnabled: boolean;
  profile: UserProfileView | null;
  riskProfile: RiskProfile | null;
  createdAt: string;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
}

export interface UpdateProfileInput {
  firstName?: string | null;
  lastName?: string | null;
  timezone?: string;
  baseCurrency?: string;
  experienceLevel?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  avatarUrl?: string | null;
}

export interface UpdateRiskProfileInput {
  profileType?: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  riskPerTradePct?: number;
  maxOpenPositions?: number;
  maxDailyLossPct?: number;
  minRiskReward?: number;
  maxPortfolioExposurePct?: number;
  maxDrawdownPct?: number;
  maxVolatility?: number;
  newsEventRestrictions?: boolean;
}

export interface MessageResponse {
  message: string;
}
