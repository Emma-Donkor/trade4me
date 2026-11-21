/** Single Prisma access point for every workspace (README §7). */
export * from '@prisma/client';
export { getPrismaClient, softConnect, disconnect } from './client';
export { withTransaction, type TransactionClient, type TransactionOptions } from './transaction';
export {
  BaseRepository,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  pageOf,
  pagination,
  type Page,
  type PaginationInput,
  type PaginationQuery,
} from './repositories/base.repo';
export {
  CANDLE_SELECT,
  CandleRepository,
  type CandleRangeInput,
  type CandleRow,
  type CandleUpsertInput,
} from './repositories/candle.repo';
export {
  QUOTE_SELECT,
  QuoteRepository,
  type QuoteRow,
  type QuoteUpsertInput,
} from './repositories/quote.repo';
