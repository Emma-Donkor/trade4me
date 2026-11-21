import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../client';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

export interface PaginationInput {
  page?: number;
  pageSize?: number;
}

export interface PaginationQuery {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

function positiveInt(value: number | undefined, fallback: number, max?: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  const truncated = Math.trunc(value);
  if (truncated < 1) return fallback;
  return max === undefined ? truncated : Math.min(truncated, max);
}

/** Normalises untrusted page input into Prisma's skip/take and stable metadata. */
export function pagination(input: PaginationInput = {}): PaginationQuery {
  const page = positiveInt(input.page, 1);
  const pageSize = positiveInt(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function pageOf<T>(items: T[], total: number, query: PaginationQuery): Page<T> {
  const { page, pageSize } = query;
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    hasNext: page * pageSize < total,
    hasPrev: page > 1 && total > 0,
  };
}

export abstract class BaseRepository {
  protected readonly client: PrismaClient = getPrismaClient();
}
