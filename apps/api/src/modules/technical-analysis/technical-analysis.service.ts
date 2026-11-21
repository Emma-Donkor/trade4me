import { Injectable } from '@nestjs/common';
import type { SymbolParam } from '@ts/validation';
import { aiUnavailable } from '../../common/errors/stub-errors';

export abstract class TechnicalAnalysisService {
  abstract technical(symbol: SymbolParam): never;
  abstract regime(symbol: SymbolParam): never;
}

@Injectable()
export class Phase7TechnicalAnalysisService extends TechnicalAnalysisService {
  technical(): never {
    aiUnavailable('technical analysis');
  }

  regime(): never {
    aiUnavailable('regime classification');
  }
}
