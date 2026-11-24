import { Inject, Injectable, Optional } from '@nestjs/common';
import type { EconomicEvent, PaginationQuery } from '@ts/types';
import { cursorPage, type CursorPage } from '../../common/helpers/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { eventProximity, isHighImpact } from './analysis/events';
import { NEWS_EVENTS_TTL_SECONDS, NewsCacheService } from './news-cache.service';
import { NEWS_NOW } from './news.tokens';

const CACHE_KEY = 'news:events';
const LOOKBACK_MS = 24 * 3_600_000;
const LOOKAHEAD_MS = 90 * 24 * 3_600_000;

function numeric(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

@Injectable()
export class EconomicEventsService {
  private readonly clock: () => Date;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: NewsCacheService,
    @Inject(NEWS_NOW) @Optional() clock?: () => Date,
  ) {
    this.clock = clock ?? (() => new Date());
  }

  /** Upcoming calendar with computed risk-rule proximity (README §11.2). */
  async upcoming(
    query: PaginationQuery = {},
    now: Date | string = this.clock(),
  ): Promise<CursorPage<EconomicEvent>> {
    const cached = await this.cache.read<EconomicEvent[]>(CACHE_KEY);
    const events = cached ?? (await this.load(now));
    if (cached === null) {
      await this.cache.write(CACHE_KEY, events, NEWS_EVENTS_TTL_SECONDS);
    }
    return cursorPage(events, query);
  }

  /** HIGH/EXTREME events inside the imminent window feed the P15 risk rule. */
  async imminentRisks(now: Date | string = this.clock()): Promise<EconomicEvent[]> {
    const cached = await this.cache.read<EconomicEvent[]>(CACHE_KEY);
    const events = cached ?? (await this.load(now));
    return events.filter(
      (event) =>
        isHighImpact(event.impact) &&
        event.minutesUntil !== undefined &&
        event.minutesUntil >= 0 &&
        event.imminent === true,
    );
  }

  private async load(now: Date | string): Promise<EconomicEvent[]> {
    const current = new Date(now);
    const rows = await this.prisma.getClient().economicEvent.findMany({
      where: {
        scheduledAt: {
          gte: new Date(current.getTime() - LOOKBACK_MS),
          lte: new Date(current.getTime() + LOOKAHEAD_MS),
        },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 500,
    });
    return rows.map((row) => {
      const proximity = eventProximity(row.scheduledAt, current);
      const event: EconomicEvent = {
        id: row.id,
        eventName: row.eventName,
        currency: row.currency,
        eventClass: row.eventClass,
        scheduledAt: row.scheduledAt.toISOString(),
        impact: row.impact,
        previous: numeric(row.previousValue),
        forecast: numeric(row.forecastValue),
        actual: numeric(row.actualValue),
        minutesUntil: proximity.minutesUntil,
        imminent: proximity.imminent,
      };
      return event;
    });
  }
}
