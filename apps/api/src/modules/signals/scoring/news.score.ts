import type { PairSentiment } from '@ts/types';
import { clampScore, component, evidence, type ComponentScore } from './component';

/** P11 sentiment is [-1, 1]; map it to the shared 0–100 score space. */
export function scoreNews(news: PairSentiment | null | undefined): ComponentScore {
  if (news === null || news === undefined) {
    return component(
      50,
      [],
      [evidence('news', 'No analysed news applies to this pair', 'missing')],
      [],
      'NEUTRAL',
    );
  }
  const score = clampScore(50 + news.score * 50);
  const item = evidence(
    'news',
    `${news.sentiment} sentiment from ${news.articleCount} analysed articles`,
    news.score,
  );
  const direction =
    news.sentiment === 'BULLISH' ? 'LONG' : news.sentiment === 'BEARISH' ? 'SHORT' : 'NEUTRAL';
  return component(score, score >= 50 ? [item] : [], score < 50 ? [item] : [], [], direction);
}
