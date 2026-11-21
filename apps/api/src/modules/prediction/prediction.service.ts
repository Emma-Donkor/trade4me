import { Injectable } from '@nestjs/common';
import type { SymbolParam } from '@ts/validation';
import { aiUnavailable } from '../../common/errors/stub-errors';

export abstract class PredictionService {
  abstract assessment(_symbol: SymbolParam): never;
  abstract report(_symbol: SymbolParam): never;
}

@Injectable()
export class Phase7PredictionService extends PredictionService {
  assessment(): never {
    aiUnavailable('combined assessment');
  }

  report(): never {
    aiUnavailable('AI market report');
  }
}
