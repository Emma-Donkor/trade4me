import { Inject, Injectable, Optional } from '@nestjs/common';
import type { PairSentiment } from '@ts/types';
import { sentimentLabel, weightedSentiment } from './analysis/weighting';
import { NEWS_SENTIMENT_TTL_SECONDS, NewsCacheService } from './news-cache.service';
import { NEWS_NOW } from './news.tokens';
import { PrismaService } from '../prisma/prisma.service';

export {
  NEUTRAL_SCORE,
  recencyWeight,
  sentimentLabel,
  weightedSentiment,
  type WeightedArticle,
} from './analysis/weighting';

@Injectable()
export class NewsAggregatorService {
  private readonly clock: () => Date;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: NewsCacheService,
    @Inject(NEWS_NOW) @Optional() clock?: () => Date,
  ) {
    this.clock = clock ?? (() => new Date());
  }

  async pairSentiment(
    symbol: string,
    now: Date | string = this.clock(),
  ): Promise<PairSentiment | null> {
    const key = `news:sentiment:${symbol}`;
    const cached = await this.cache.read<PairSentiment>(key);
    if (cached !== null) return cached;

    const rows = await this.prisma.getClient().newsArticle.findMany({
      where: { analysis: { is: { affectedPairs: { has: symbol } } } },
      select: {
        publishedAt: true,
        analysis: { select: { sentiment: true, impact: true } },
      },
      orderBy: { publishedAt: 'desc' },
      take: 200,
    });
    const articles = rows.flatMap((row) =>
      row.analysis === null
        ? []
        : [
            {
              sentiment: row.analysis.sentiment,
              impact: row.analysis.impact,
              publishedAt: row.publishedAt,
            },
          ],
    );
    if (articles.length === 0) return null;

    const { score, articleCount } = weightedSentiment(articles, now);
    const result: PairSentiment = {
      symbol,
      score,
      sentiment: sentimentLabel(score),
      articleCount,
      computedAt: new Date(now).toISOString(),
    };
    await this.cache.write(key, result, NEWS_SENTIMENT_TTL_SECONDS);
    return result;
  }
}
