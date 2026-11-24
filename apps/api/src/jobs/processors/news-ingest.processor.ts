import { Injectable } from '@nestjs/common';
import { JsonLogger } from '../../common/logger/json-logger';
import { RedisService } from '../../modules/redis/redis.service';
import { NewsIngestionService } from '../../modules/news/news-ingestion.service';
import { IdempotentProcessor } from '../base.processor';

export interface NewsIngestJobData {
  /** Reserved for manual replays; the scheduled job ingests all feeds. */
  reason?: string;
}

/** Real `news-ingest` worker: provider → dedupe → classify → cache → WS. */
@Injectable()
export class NewsIngestProcessor extends IdempotentProcessor<NewsIngestJobData> {
  constructor(
    logger: JsonLogger,
    redis: RedisService,
    private readonly ingestion: NewsIngestionService,
  ) {
    super(logger, redis);
  }

  protected async handle(data: NewsIngestJobData): Promise<void> {
    const result = await this.ingestion.run();
    this.logger.log('news ingest complete', 'WORKER', {
      reason: data.reason ?? 'cron',
      articlesFetched: result.articlesFetched,
      articlesInserted: result.articlesInserted,
      duplicates: result.duplicates,
      eventsInserted: result.eventsInserted,
      highImpact: result.highImpact,
    });
  }
}
