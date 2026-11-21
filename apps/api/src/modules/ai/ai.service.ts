import { Injectable } from '@nestjs/common';
import type { AssistantRequest, ExplainRequest, SymbolParam } from '@ts/validation';
import { aiUnavailable } from '../../common/errors/stub-errors';

export abstract class AiService {
  abstract assessment(_symbol: SymbolParam): never;
  abstract explain(_input: ExplainRequest): never;
  abstract assistant(_input: AssistantRequest): never;
}

@Injectable()
export class Phase7AiService extends AiService {
  assessment(): never {
    aiUnavailable('assessment explanation');
  }

  explain(): never {
    aiUnavailable('explanation');
  }

  assistant(): never {
    aiUnavailable('assistant');
  }
}
