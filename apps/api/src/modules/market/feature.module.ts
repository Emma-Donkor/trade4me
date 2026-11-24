import { Module } from '@nestjs/common';
import { AiEngineClient, AI_ENGINE_FETCH } from '../technical-analysis/ai-engine.client';
import { FeatureService } from './feature.service';
import { MarketModule } from './market.module';

/** P12 — imports MarketModule without creating a Market ↔ News cycle. */
@Module({
  imports: [MarketModule],
  providers: [
    FeatureService,
    AiEngineClient,
    { provide: AI_ENGINE_FETCH, useValue: (url: string, init?: RequestInit) => fetch(url, init) },
  ],
  exports: [FeatureService],
})
export class FeatureModule {}
