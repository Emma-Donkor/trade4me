import type { ApiSuccess, ErrorCode } from './contracts';

/** README §8.1 success envelope (alias kept for API consumers). */
export type ApiResponse<T> = ApiSuccess<T>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  limit?: number;
  cursor?: string;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId: string;
}
