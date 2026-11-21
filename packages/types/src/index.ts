/**
 * Single source of truth for shared data contracts (README, PHASE 05).
 *
 * Types are pure declarations with no runtime dependencies. AI route payloads
 * stay in `contracts.ts` so the cross-language parity guard reads one file.
 */
export * from './contracts';
export * from './auth';
export * from './market';
export * from './news';
export * from './ai';
export * from './prediction';
export * from './signal';
export * from './risk';
export * from './trading';
export * from './portfolio';
export * from './notification';
export * from './api';
export * from './ws';

export const MONOREPO_ROOT_PACKAGE = 'tradesense-ai' as const;

/** Double-submit CSRF pair used by cookie-authenticated auth mutations. */
export const CSRF_COOKIE_NAME = 'ts_csrf' as const;
export const CSRF_HEADER_NAME = 'x-csrf-token' as const;

export type MonorepoRootPackage = typeof MONOREPO_ROOT_PACKAGE;
