import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  assistantRequestSchema,
  explainRequestSchema,
  symbolParamSchema,
  type AssistantRequest,
  type ExplainRequest,
  type SymbolParam,
} from '@ts/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('assessment/:symbol')
  assessment(@Param(new ZodValidationPipe(symbolParamSchema)) symbol: SymbolParam) {
    return this.ai.assessment(symbol);
  }

  @Post('explain')
  explain(@Body(new ZodValidationPipe(explainRequestSchema)) input: ExplainRequest) {
    return this.ai.explain(input);
  }

  @Post('assistant')
  assistant(@Body(new ZodValidationPipe(assistantRequestSchema)) input: AssistantRequest) {
    return this.ai.assistant(input);
  }
}
