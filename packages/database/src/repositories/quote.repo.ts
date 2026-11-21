import { Prisma } from '@prisma/client';
import { BaseRepository } from './base.repo';

export const QUOTE_SELECT = {
  id: true,
  pairId: true,
  bid: true,
  ask: true,
  spread: true,
  timestamp: true,
  provider: true,
} as const satisfies Prisma.MarketQuoteSelect;

export type QuoteRow = Prisma.MarketQuoteGetPayload<{ select: typeof QUOTE_SELECT }>;

export interface QuoteUpsertInput {
  pairId: string;
  bid: number;
  ask: number;
  spread: number;
  timestamp: Date;
  provider: string;
}

export class QuoteRepository extends BaseRepository {
  /** Refresh jobs replace the quote at the same instant instead of stacking rows. */
  async upsert(input: QuoteUpsertInput): Promise<QuoteRow> {
    const { pairId, timestamp } = input;
    return this.client.marketQuote.upsert({
      where: { quote_pair_timestamp_key: { pairId, timestamp } },
      create: input,
      update: { bid: input.bid, ask: input.ask, spread: input.spread, provider: input.provider },
      select: QUOTE_SELECT,
    });
  }

  async latest(pairId: string): Promise<QuoteRow | null> {
    return this.client.marketQuote.findFirst({
      where: { pairId },
      select: QUOTE_SELECT,
      orderBy: [{ timestamp: 'desc' }],
    });
  }
}
