import { Injectable } from '@nestjs/common';
import type { z } from '@ts/validation';
import { idParamSchema } from '../../common/dto/phase7.dto';
import { insufficientData } from '../../common/errors/stub-errors';
import type { ScannerHttpQuery, SignalsQuery } from './dto/signals.dto';

type IdParam = z.infer<typeof idParamSchema>;

export abstract class SignalsService {
  abstract recent(_query: SignalsQuery): never;
  abstract detail(_id: IdParam): never;
  abstract scan(_query: ScannerHttpQuery): never;
}

@Injectable()
export class Phase7SignalsService extends SignalsService {
  recent(): never {
    insufficientData('trade signals');
  }

  detail(): never {
    insufficientData('signal detail');
  }

  scan(): never {
    insufficientData('all-pairs scanner');
  }
}
