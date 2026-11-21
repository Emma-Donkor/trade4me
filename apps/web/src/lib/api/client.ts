import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiError, ApiSuccess, ErrorCode } from '@ts/types';

const REFRESH_PATH = '/auth/refresh';
const PUBLIC_PATHS = new Set([
  '/auth/register',
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/reset-password',
]);

type RetryConfig = InternalAxiosRequestConfig & { _retried?: boolean };

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

/** Normalized error carrying the API envelope code for form mapping. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function envelopeOf(error: AxiosError): ApiError | null {
  const body = error.response?.data;
  if (body && typeof body === 'object' && 'success' in body && body.success === false) {
    return body as ApiError;
  }
  return null;
}

export function fromUnknownError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;
  if (error instanceof AxiosError) {
    const envelope = envelopeOf(error);
    const detail = envelope?.error;
    return new ApiRequestError(
      detail?.message ?? error.message ?? 'Request failed',
      detail?.code ?? 'HTTP_ERROR',
      detail?.requestId,
      detail?.details,
    );
  }
  return new ApiRequestError(
    error instanceof Error ? error.message : 'Request failed',
    'INTERNAL_ERROR',
  );
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

const http: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = http
      .post<ApiSuccess<{ tokens: { accessToken: string } }>>(REFRESH_PATH, {})
      .then((response) => {
        const token = response.data.data.tokens.accessToken;
        setAccessToken(token);
        return token;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!(error instanceof AxiosError)) return Promise.reject(fromUnknownError(error));
    const original = error.config as RetryConfig | undefined;
    const shouldRefresh =
      error.response?.status === 401 &&
      original !== undefined &&
      !original._retried &&
      !PUBLIC_PATHS.has(original.url ?? '');
    if (shouldRefresh && original) {
      original._retried = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return http(original);
      }
    }
    return Promise.reject(fromUnknownError(error));
  },
);

/** Unwraps the documented `{ success, data, requestId }` envelope. */
export function unwrap<T>(response: { data: ApiSuccess<T> }): T {
  return response.data.data;
}

export const apiClient = http;
