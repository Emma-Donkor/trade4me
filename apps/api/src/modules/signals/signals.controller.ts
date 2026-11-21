import { Controller, Get, Param, Query } from '@nestjs/common';
import type { z } from '@ts/validation';
import { idParamSchema } from '../../common/dto/phase7.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  scannerHttpQuerySchema,
  signalsQuerySchema,
  type ScannerHttpQuery,
  type SignalsQuery,
} from './dto/signals.dto';
import { SignalsService } from './signals.service';

type IdParam = z.infer<typeof idParamSchema>;

@Controller()
export class SignalsController {
  constructor(private readonly signals: SignalsService) {}

  @Get('signals')
  recent(@Query(new ZodValidationPipe(signalsQuerySchema)) query: SignalsQuery) {
    return this.signals.recent(query);
  }

  @Get('signals/:id')
  detail(@Param(new ZodValidationPipe(idParamSchema)) id: IdParam) {
    return this.signals.detail(id);
  }

  @Get('scanner')
  scan(@Query(new ZodValidationPipe(scannerHttpQuerySchema)) query: ScannerHttpQuery) {
    return this.signals.scan(query);
  }
}
