import { Injectable } from '@nestjs/common';
import type { HistoricalAnalysisView, Timeframe } from '@ts/types';
import type { HistoricalQuery, SymbolParam } from '@ts/validation';
import { insufficientData } from '../../common/errors/stub-errors';
import { CandleService } from '../market/candles.service';
import { FeatureService } from '../market/feature.service';
import { aggregateHistorical } from './aggregations';

function lookbackMs(timeframe: Timeframe): number {
  return timeframe === 'D1' ? 730 * 86_400_000 : 180 * 86_400_000;
}

export abstract class HistoricalAnalysisService {
  abstract historical(
    symbol: SymbolParam,
    query?: HistoricalQuery,
  ): Promise<HistoricalAnalysisView>;
}

/** README §9.3 — real OHLC aggregations plus live feature-space NN. */
@Injectable()
export class HistoricalAnalysisServiceImpl extends HistoricalAnalysisService {
  constructor(
    private readonly candles: CandleService,
    private readonly features: FeatureService,
  ) {
    super();
  }

  async historical(
    symbol: SymbolParam,
    query: HistoricalQuery = { timeframe: 'D1', limit: 5 },
  ): Promise<HistoricalAnalysisView> {
    const asOf = new Date();
    const timeframe = query.timeframe;
    const rows = await this.candles.series(
      symbol.symbol,
      timeframe,
      new Date(asOf.getTime() - lookbackMs(timeframe)),
      asOf,
      5_000,
    );
    if (rows.length === 0) {
      insufficientData('historical candles', { symbol: symbol.symbol, timeframe });
    }
    const similarConditions = await this.features.nearest(
      symbol.symbol,
      timeframe,
      asOf,
      rows,
      query.limit,
    );
    return aggregateHistorical({
      symbol: symbol.symbol,
      timeframe,
      asOf,
      candles: rows,
      similarConditions,
    });
  }
}

/** Backwards-compatible name used by the P07 module wiring. */
export { HistoricalAnalysisServiceImpl as Phase7HistoricalAnalysisService };
