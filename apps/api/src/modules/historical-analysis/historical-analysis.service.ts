import { Injectable } from '@nestjs/common';
import type { SymbolParam } from '@ts/validation';
import { aiUnavailable } from '../../common/errors/stub-errors';

export abstract class HistoricalAnalysisService {
  abstract historical(_symbol: SymbolParam): never;
}

@Injectable()
export class Phase7HistoricalAnalysisService extends HistoricalAnalysisService {
  historical(): never {
    aiUnavailable('historical analysis');
  }
}
