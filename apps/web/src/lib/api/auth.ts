import type {
  ApiSuccess,
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
import type { AuthTokens } from '@ts/types';
import { apiClient, setAccessToken, unwrap } from './client';

export interface SessionResponse {
  user: UserView;
  tokens: AuthTokens;
}

/** Every auth call goes through the same same-origin client and envelope. */
export const authApi = {
  async register(input: RegisterInput): Promise<MessageResponse> {
    return unwrap(await apiClient.post<ApiSuccess<MessageResponse>>('/auth/register', input));
  },

  async login(input: LoginInput): Promise<SessionResponse> {
    const session = unwrap(await apiClient.post<ApiSuccess<SessionResponse>>('/auth/login', input));
    setAccessToken(session.tokens.accessToken);
    return session;
  },

  async refresh(): Promise<SessionResponse> {
    const session = unwrap(await apiClient.post<ApiSuccess<SessionResponse>>('/auth/refresh', {}));
    setAccessToken(session.tokens.accessToken);
    return session;
  },

  async logout(): Promise<MessageResponse> {
    try {
      return unwrap(await apiClient.post<ApiSuccess<MessageResponse>>('/auth/logout', {}));
    } finally {
      setAccessToken(null);
    }
  },

  async verifyEmail(token: string): Promise<MessageResponse> {
    return unwrap(
      await apiClient.post<ApiSuccess<MessageResponse>>('/auth/verify-email', { token }),
    );
  },

  async forgotPassword(input: ForgotPasswordInput): Promise<MessageResponse> {
    return unwrap(
      await apiClient.post<ApiSuccess<MessageResponse>>('/auth/forgot-password', input),
    );
  },

  async resetPassword(input: ResetPasswordInput): Promise<MessageResponse> {
    return unwrap(await apiClient.post<ApiSuccess<MessageResponse>>('/auth/reset-password', input));
  },

  async me(): Promise<UserView> {
    return unwrap(await apiClient.get<ApiSuccess<UserView>>('/users/me'));
  },

  async updateMe(input: UpdateProfileInput): Promise<UserView> {
    return unwrap(await apiClient.patch<ApiSuccess<UserView>>('/users/me', input));
  },

  async riskProfile(): Promise<UserView['riskProfile']> {
    return unwrap(
      await apiClient.get<ApiSuccess<UserView['riskProfile']>>('/users/me/risk-profile'),
    );
  },

  async updateRiskProfile(input: UpdateRiskProfileInput): Promise<UserView['riskProfile']> {
    return unwrap(
      await apiClient.patch<ApiSuccess<UserView['riskProfile']>>('/users/me/risk-profile', input),
    );
  },

  async sessions(): Promise<SessionInfo[]> {
    return unwrap(await apiClient.get<ApiSuccess<SessionInfo[]>>('/users/me/sessions'));
  },
};
