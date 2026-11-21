import { Injectable } from '@nestjs/common';
import type { RiskCalculateInput, RiskEvaluateInput } from '@ts/validation';
import { notImplemented } from '../../common/errors/stub-errors';

export abstract class RiskService {
  abstract calculate(_input: RiskCalculateInput): never;
  abstract rules(): { items: never[] };
  abstract evaluate(_input: RiskEvaluateInput): never;
}

@Injectable()
export class Phase7RiskService extends RiskService {
  calculate(): never {
    notImplemented('risk calculation');
  }

  rules(): { items: never[] } {
    return { items: [] };
  }

  evaluate(): never {
    notImplemented('risk rule evaluation');
  }
}
