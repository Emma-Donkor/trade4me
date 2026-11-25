import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  riskCalculateSchema,
  riskEvaluateRequestSchema,
  type RiskCalculateInput,
  type RiskEvaluateRequest,
} from '@ts/validation';
import { CurrentUser } from '../../common/decorators/current-user';
import type { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RiskService } from './risk.service';

@Controller('risk')
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  calculate(
    @Body(new ZodValidationPipe(riskCalculateSchema)) input: RiskCalculateInput,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.risk.calculate(input, user?.id);
  }

  @Get('rules')
  rules(@CurrentUser() user?: AuthenticatedUser) {
    return this.risk.rules(user?.id);
  }

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  evaluate(
    @Body(new ZodValidationPipe(riskEvaluateRequestSchema)) input: RiskEvaluateRequest,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.risk.evaluate(input, user?.id);
  }
}
