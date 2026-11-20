import { Global, Module } from '@nestjs/common';
import { JsonLogger } from './logger/json-logger';

/** Provides the structured logger to every module without repeated imports. */
@Global()
@Module({
  providers: [JsonLogger],
  exports: [JsonLogger],
})
export class CommonModule {}
