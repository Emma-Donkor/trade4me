import { BadRequestException } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';

export interface CursorPage<T> {
  items: T[];
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

const DEFAULT_LIMIT = 50;

export function encodeCursor(offset: number): string {
  return Buffer.from(`cursor:${offset}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): number {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const match = /^cursor:(\d+)$/.exec(decoded);
    if (!match) throw new Error('bad shape');
    return Number(match[1]);
  } catch {
    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message: 'Invalid cursor',
    });
  }
}

/**
 * Cursor pagination for Phase 7 list shells. Inputs are already validated by
 * the shared `paginationSchema`; page/pageSize remain supported for callers
 * that use repository-style pagination, but the wire response is cursor-based.
 */
export function cursorPage<T>(items: readonly T[], query: PaginationQuery = {}): CursorPage<T> {
  const limit = query.limit ?? query.pageSize ?? DEFAULT_LIMIT;
  const offset = query.cursor
    ? decodeCursor(query.cursor)
    : Math.max(0, (query.page ?? 1) - 1) * limit;
  const pageItems = items.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;
  return {
    items: pageItems,
    limit,
    nextCursor: nextOffset < items.length ? encodeCursor(nextOffset) : null,
    hasMore: nextOffset < items.length,
  };
}

export function emptyPage<T>(query: PaginationQuery = {}): CursorPage<T> {
  return cursorPage<T>([], query);
}
