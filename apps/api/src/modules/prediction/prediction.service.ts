import { Injectable } from '@nestjs/common';
import type { CombinedAssessmentView } from '@ts/types';
import type { SymbolParam } from '@ts/validation';
import { aiUnavailable } from '../../common/errors/stub-errors';
import { HistoricalAnalysisService } from '../historical-analysis/historical-analysis.service';
import { TechnicalAnalysisService } from '../technical-analysis/technical-analysis.service';
import { EventsService } from '../websocket/events.service';

export abstract class PredictionService {
  abstract assessment(symbol: SymbolParam): Promise<CombinedAssessmentView>;
  abstract report(symbol: SymbolParam): never;
}

/** P10 — the combined assessment is real; the P17 LLM report stays honest. */
@Injectable()
export class Phase10PredictionService extends PredictionService {
  constructor(
    private readonly technical: TechnicalAnalysisService,
    private readonly historical: HistoricalAnalysisService,
    private readonly events: EventsService,
  ) {
    super();
  }

  async assessment(symbol: SymbolParam): Promise<CombinedAssessmentView> {
    const [technical, historical] = await Promise.all([
      this.technical.technical(symbol),
      this.historical.historical(symbol),
    ]);
    const view: CombinedAssessmentView = {
      symbol: symbol.symbol,
      timeframe: technical.timeframe,
      asOf: new Date().toISOString(),
      technical,
      historical,
      regime: technical.regime,
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
}

/** Backwards-compatible name used by the P07 module wiring. */
export { Phase10PredictionService as Phase7PredictionService };
