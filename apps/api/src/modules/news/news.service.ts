import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  EconomicEvent,
  NewsArticle,
  NewsEventType,
  NewsImpact,
  PaginationQuery,
  PairSentiment,
  Sentiment,
} from '@ts/types';
import { insufficientData } from '../../common/errors/stub-errors';
import { decodeCursor, encodeCursor, type CursorPage } from '../../common/helpers/pagination';
import { idParamSchema } from '../../common/dto/phase7.dto';
import type { z } from '@ts/validation';
import { PrismaService } from '../prisma/prisma.service';
import { decodeStoredText } from './analysis/sanitizer';
import type { NewsListQuery } from './news.controller';
import { NewsAggregatorService } from './aggregator.service';
import { NEWS_FEED_TTL_SECONDS, NewsCacheService } from './news-cache.service';
import { EconomicEventsService } from './economic-events.service';

type IdParam = z.infer<typeof idParamSchema>;
type ArticleRow = Prisma.NewsArticleGetPayload<{ include: { analysis: true } }>;

export abstract class NewsService {
  abstract feed(query: NewsListQuery): Promise<CursorPage<NewsArticle>>;
  abstract events(query: PaginationQuery): Promise<CursorPage<EconomicEvent>>;
  abstract article(id: IdParam): Promise<NewsArticle>;
  abstract sentiment(symbol: { symbol: string }): Promise<PairSentiment>;
}

const DEFAULT_LIMIT = 50;
const MAX_FEED_ROWS = 500;

function toArticle(row: ArticleRow): NewsArticle {
  const safety = decodeStoredText(row.rawText).safety;
  return {
    id: row.id,
    source: row.source,
    sourceUrl: row.sourceUrl,
    title: row.title,
    ...(row.description === null ? {} : { description: row.description }),
    publishedAt: row.publishedAt.toISOString(),
    currencies: row.currencies,
    ...(row.analysis === null
      ? {}
      : {
          analysis: {
            articleId: row.analysis.articleId,
            eventType: row.analysis.eventType as NewsEventType,
            sentiment: row.analysis.sentiment,
            impact: row.analysis.impact,
            confidence: Number(row.analysis.confidence),
            affectedPairs: row.analysis.affectedPairs,
            analyzedBy: row.analysis.analyzedBy,
            analyzedAt: row.analysis.analyzedAt.toISOString(),
          },
        }),
    safety,
  };
}

/** Real Phase 11 bodies: classified, deduplicated, cached news reads. */
@Injectable()
export class NewsServiceImpl extends NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: NewsCacheService,
    private readonly aggregator: NewsAggregatorService,
    private readonly calendar: EconomicEventsService,
  ) {
    super();
  }

  async feed(query: NewsListQuery): Promise<CursorPage<NewsArticle>> {
    const limit = Math.min(MAX_FEED_ROWS, query.limit ?? query.pageSize ?? DEFAULT_LIMIT);
    const offset = query.cursor
      ? decodeCursor(query.cursor)
      : Math.max(0, (query.page ?? 1) - 1) * limit;
    const key = [
      'news:feed',
      query.currency ?? '-',
      query.sentiment ?? '-',
      query.impact ?? '-',
      limit,
      offset,
    ].join(':');

    const cached = await this.cache.read<CursorPage<NewsArticle>>(key);
    if (cached !== null) return cached;

    const where: Prisma.NewsArticleWhereInput = {
      ...(query.currency ? { currencies: { has: query.currency } } : {}),
      ...(query.sentiment || query.impact
        ? {
            analysis: {
              is: {
                ...(query.sentiment ? { sentiment: query.sentiment as Sentiment } : {}),
                ...(query.impact ? { impact: query.impact as NewsImpact } : {}),
              },
            },
          }
        : {}),
    };
    const rows = await this.prisma.getClient().newsArticle.findMany({
      where,
      include: { analysis: true },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(toArticle);
    const page: CursorPage<NewsArticle> = {
      items,
      limit,
      nextCursor: hasMore ? encodeCursor(offset + items.length) : null,
      hasMore,
    };
    await this.cache.write(key, page, NEWS_FEED_TTL_SECONDS);
    return page;
  }

  events(query: PaginationQuery): Promise<CursorPage<EconomicEvent>> {
    return this.calendar.upcoming(query);
  }

  async article(id: IdParam): Promise<NewsArticle> {
    const row = await this.prisma.getClient().newsArticle.findUnique({
      where: { id: id.id },
      include: { analysis: true },
    });
    if (row === null) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Unknown news article ${id.id}`,
        details: { id: id.id },
      });
    }
    return toArticle(row);
  }

  async sentiment(symbol: { symbol: string }): Promise<PairSentiment> {
    const result = await this.aggregator.pairSentiment(symbol.symbol);
    if (result === null) insufficientData('news sentiment', { symbol: symbol.symbol });
    return result;
  }
}
