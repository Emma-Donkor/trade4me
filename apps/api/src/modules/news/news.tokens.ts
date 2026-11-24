/** Injectable clock so mock-feed timestamps and freshness checks are stable. */
export const NEWS_NOW = Symbol('NEWS_NOW');
export type NewsClock = () => Date;
