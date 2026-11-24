import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { NewsImpact, NewsSafety, Notification, Sentiment } from '@ts/types';
import { JsonLogger } from '../../common/logger/json-logger';
import { PrismaService } from '../prisma/prisma.service';
import { SystemEventService } from '../market/system-event.service';
import { EventsService } from '../websocket/events.service';
import { classifyText } from './analysis/classifier';
import { detectEventClass, isHighImpact } from './analysis/events';
import { extractCurrencies, pairsForCurrencies } from './analysis/extractor';
import { contentHash, encodeStoredText, sanitizeText } from './analysis/sanitizer';
import { NEWS_NOW } from './news.tokens';
import { NewsCacheService } from './news-cache.service';
import { NewsProviderRegistry } from './providers/news.registry';

export const NEWS_ANALYZER = 'lexicon-v1';

export interface NewsIngestResult {
  articlesFetched: number;
  articlesInserted: number;
  duplicates: number;
  eventsFetched: number;
  eventsInserted: number;
  highImpact: number;
}

const EMPTY_RESULT: NewsIngestResult = {
  articlesFetched: 0,
  articlesInserted: 0,
  duplicates: 0,
  eventsFetched: 0,
  eventsInserted: 0,
  highImpact: 0,
};

@Injectable()
export class NewsIngestionService {
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: NewsProviderRegistry,
    private readonly cache: NewsCacheService,
    private readonly events: EventsService,
    private readonly systemEvents: SystemEventService,
    private readonly logger: JsonLogger,
    @Inject(NEWS_NOW) @Optional() now?: () => Date,
  ) {
    this.now = now ?? (() => new Date());
  }

  /** Cron entry point: article and calendar failures are isolated. */
  async run(): Promise<NewsIngestResult> {
    const [articles, calendar] = await Promise.allSettled([
      this.ingestArticles(),
      this.ingestEvents(),
    ]);
    if (articles.status === 'rejected') this.logFailure('articles', articles.reason);
    if (calendar.status === 'rejected') this.logFailure('calendar', calendar.reason);
    const articleResult = articles.status === 'fulfilled' ? articles.value : EMPTY_RESULT;
    const calendarResult = calendar.status === 'fulfilled' ? calendar.value : EMPTY_RESULT;
    return {
      ...articleResult,
      eventsFetched: calendarResult.eventsFetched,
      eventsInserted: calendarResult.eventsInserted,
    };
  }

  async ingestArticles(): Promise<NewsIngestResult> {
    const now = this.now();
    const provider = this.registry.articles();
    let raw: Awaited<ReturnType<typeof provider.fetchArticles>>;
    try {
      raw = await provider.fetchArticles(now);
    } catch (error) {
      this.logFailure('articles', error);
      return { ...EMPTY_RESULT };
    }

    const client = this.prisma.getClient();
    const pairs = await client.currencyPair.findMany({
      where: { isActive: true },
      select: { symbol: true },
    });
    const knownPairs = pairs.map((pair) => pair.symbol);

    let inserted = 0;
    let duplicates = 0;
    let highImpact = 0;

    for (const item of raw) {
      const title = sanitizeText(item.title);
      const description = sanitizeText(item.description ?? '');
      const body = sanitizeText(item.content ?? '');
      const combined = [title.text, description.text, body.text].filter(Boolean).join('. ');
      const safety: NewsSafety = {
        injectionAttempted:
          title.safety.injectionAttempted ||
          description.safety.injectionAttempted ||
          body.safety.injectionAttempted,
        redactions:
          title.safety.redactions + description.safety.redactions + body.safety.redactions,
        truncated: title.safety.truncated || description.safety.truncated || body.safety.truncated,
      };
      // Content identity excludes the URL: syndicated copies at different
      // sources must collapse to one article, alongside the unique-URL guard.
      const hash = contentHash([title.text, description.text, body.text]);

      const existing = await client.newsArticle.findFirst({
        where: { OR: [{ sourceUrl: item.sourceUrl }, { contentHash: hash }] },
        select: { id: true },
      });
      if (existing !== null) {
        duplicates += 1;
        continue;
      }

      const currencies = extractCurrencies(combined);
      const classification = classifyText(combined);
      const affectedPairs = pairsForCurrencies(currencies, knownPairs);
      const publishedAt = new Date(item.publishedAt);
      const safePublishedAt = Number.isNaN(publishedAt.getTime()) ? now : publishedAt;

      try {
        const article = await client.newsArticle.create({
          data: {
            source: item.source,
            sourceUrl: item.sourceUrl,
            title: title.text,
            ...(description.text.length > 0 ? { description: description.text } : {}),
            contentHash: hash,
            publishedAt: safePublishedAt,
            currencies,
            rawText: encodeStoredText({ text: combined, safety }),
            analysis: {
              create: {
                eventType: classification.eventType,
                sentiment: classification.sentiment,
                impact: classification.impact,
                confidence: classification.confidence,
                affectedPairs,
                analyzedBy: NEWS_ANALYZER,
                analyzedAt: now,
              },
            },
          },
          select: { id: true, title: true },
        });
        inserted += 1;

        if (safety.injectionAttempted) {
          await this.systemEvents.history(
            'news_injection_scrubbed',
            {
              articleId: article.id,
              redactions: safety.redactions,
            },
            'WARN',
          );
        }
        if (isHighImpact(classification.impact)) {
          highImpact += 1;
          this.emitAlert(
            article.id,
            article.title,
            description.text || title.text,
            classification.impact,
            classification.sentiment,
            classification.eventType,
            affectedPairs,
            now,
          );
        }
      } catch (error) {
        // A concurrent ingest may have won the unique URL/content race.
        duplicates += 1;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          this.logger.warn(`news article skipped: ${String(error)}`, 'NEWS');
        } else {
          this.logFailure('article_persist', error);
        }
      }
    }

    if (inserted > 0) {
      await this.cache.invalidateAll();
    }
    return {
      articlesFetched: raw.length,
      articlesInserted: inserted,
      duplicates,
      eventsFetched: 0,
      eventsInserted: 0,
      highImpact,
    };
  }

  async ingestEvents(): Promise<NewsIngestResult> {
    const now = this.now();
    const provider = this.registry.events();
    let raw: Awaited<ReturnType<typeof provider.fetchEvents>>;
    try {
      raw = await provider.fetchEvents(now);
    } catch (error) {
      this.logFailure('calendar', error);
      return { ...EMPTY_RESULT };
    }

    const client = this.prisma.getClient();
    let inserted = 0;
    for (const item of raw) {
      const scheduledAt = new Date(item.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) continue;
      const existing = await client.economicEvent.findFirst({
        where: {
          eventName: item.eventName,
          currency: item.currency,
          scheduledAt,
        },
        select: { id: true },
      });
      if (existing !== null) continue;
      await client.economicEvent.create({
        data: {
          eventName: item.eventName,
          currency: item.currency,
          eventClass: detectEventClass(item.eventName),
          scheduledAt,
          impact: item.impact,
          ...(item.previous === undefined ? {} : { previousValue: String(item.previous) }),
          ...(item.forecast === undefined ? {} : { forecastValue: String(item.forecast) }),
          ...(item.actual === undefined ? {} : { actualValue: String(item.actual) }),
        },
      });
      inserted += 1;
    }
    if (inserted > 0) await this.cache.invalidateAll();
    return {
      ...EMPTY_RESULT,
      eventsFetched: raw.length,
      eventsInserted: inserted,
    };
  }

  private emitAlert(
    articleId: string,
    title: string,
    body: string,
    impact: NewsImpact,
    sentiment: Sentiment,
    eventType: string,
    affectedPairs: string[],
    now: Date,
  ): void {
    const notification: Notification = {
      id: `news-${articleId}`,
      type: 'NEWS_ALERT',
      title: `High-impact news: ${title}`,
      body: body.slice(0, 240),
      payload: { articleId, impact, sentiment, eventType, affectedPairs },
      read: false,
      createdAt: now.toISOString(),
    };
    // P27 owns persistence/delivery; P11 prepares the typed fan-out only.
    this.events.notificationNew({ notification });
  }

  private logFailure(kind: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`news ${kind} ingest failed: ${message}`, 'NEWS');
    void this.systemEvents.providerFailure('news-ingest', kind, { error: message });
  }
}
