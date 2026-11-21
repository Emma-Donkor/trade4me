import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  riskCalculateSchema,
  riskEvaluateSchema,
  type RiskCalculateInput,
  type RiskEvaluateInput,
} from '@ts/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RiskService } from './risk.service';

@Controller('risk')
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Post('calculate')
  calculate(@Body(new ZodValidationPipe(riskCalculateSchema)) input: RiskCalculateInput) {
    return this.risk.calculate(input);
  }

  @Get('rules')
  rules() {
    return this.risk.rules();
  }

  @Post('evaluate')
  evaluate(@Body(new ZodValidationPipe(riskEvaluateSchema)) input: RiskEvaluateInput) {
    return this.risk.evaluate(input);
  }
}
