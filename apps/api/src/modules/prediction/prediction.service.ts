import { Injectable } from '@nestjs/common';
import type { CombinedAssessmentView } from '@ts/types';
import type { SymbolParam } from '@ts/validation';
import { JsonLogger } from '../../common/logger/json-logger';
import { aiUnavailable } from '../../common/errors/stub-errors';
import { HistoricalAnalysisService } from '../historical-analysis/historical-analysis.service';
import { TechnicalAnalysisService } from '../technical-analysis/technical-analysis.service';
import { EventsService } from '../websocket/events.service';
import { PredictionEngineService } from './prediction-engine.service';

export abstract class PredictionService {
  abstract assessment(symbol: SymbolParam): Promise<CombinedAssessmentView>;
  abstract report(symbol: SymbolParam): never;
}

/** P10/P14 — the combined assessment stays available even if inference fails. */
@Injectable()
export class Phase10PredictionService extends PredictionService {
  constructor(
    private readonly technical: TechnicalAnalysisService,
    private readonly historical: HistoricalAnalysisService,
    private readonly events: EventsService,
    private readonly engine: PredictionEngineService,
    private readonly logger: JsonLogger,
  ) {
    super();
  }

  async assessment(symbol: SymbolParam): Promise<CombinedAssessmentView> {
    const [technical, historical] = await Promise.all([
      this.technical.technical(symbol),
      this.historical.historical(symbol),
    ]);
    const prediction = await this.predictionFields(symbol, technical.timeframe);
    const view: CombinedAssessmentView = {
      symbol: symbol.symbol,
      timeframe: technical.timeframe,
      asOf: new Date().toISOString(),
      technical,
      historical,
      regime: technical.regime,
      prediction: prediction.prediction,
      modelStatus: prediction.modelStatus,
      signalPolicy: prediction.signalPolicy,
      pendingPhases: ['P11', 'P12', 'P17'],
    };
    this.events.analysisUpdated({
      symbol: symbol.symbol,
      assessment: view as unknown as Record<string, unknown>,
    });
    return view;
  }

  report(): never {
    aiUnavailable('AI market report');
  }

  /** Never turn an inference outage into an unavailable assessment. */
  private async predictionFields(
    symbol: SymbolParam,
    timeframe: CombinedAssessmentView['timeframe'],
  ): Promise<Pick<CombinedAssessmentView, 'prediction' | 'modelStatus' | 'signalPolicy'>> {
    try {
      return await this.engine.assessmentFields(symbol, timeframe);
    } catch (error) {
      this.logger.warn(
        `prediction unavailable for ${symbol.symbol}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'PREDICTION',
      );
      const policy = PredictionEngineService.policy('TRAINING');
      return { prediction: null, modelStatus: 'TRAINING', signalPolicy: policy };
    }
  }
}

/** Backwards-compatible name used by the P07 module wiring/tests. */
export { Phase10PredictionService as Phase7PredictionService };
