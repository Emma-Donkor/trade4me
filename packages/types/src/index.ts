/**
 * Shared type barrel.
 *
 * Domain types are introduced by the phases that own them; this skeleton only
 * exports monorepo-level identifiers used to verify workspace wiring.
 */
export const MONOREPO_ROOT_PACKAGE = 'tradesense-ai' as const;

export type MonorepoRootPackage = typeof MONOREPO_ROOT_PACKAGE;
