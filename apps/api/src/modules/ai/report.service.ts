import { Injectable } from '@nestjs/common';
import type { MarketReportView, ReportInput } from '@ts/validation';
import { JsonLogger } from '../../common/logger/json-logger';
import { AiEngineClient } from '../technical-analysis/ai-engine.client';
import { scenarioSplit, templateReport } from './template';

/** P17 — report narration with deterministic scenario math and template fallback. */
@Injectable()
export class ReportService {
  constructor(
    private readonly ai: AiEngineClient,
    private readonly logger: JsonLogger,
  ) {}

  async generate(input: ReportInput): Promise<MarketReportView> {
    const localScenarios = scenarioSplit(input.prediction);
    try {
      const report = await this.ai.report(input);
      const scenarios = this.normalise(report.scenarios, localScenarios);
      return { ...report, scenarios };
    } catch (error) {
      this.logger.warn(
        `AI report unavailable for ${input.symbol}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'AI',
      );
      return templateReport(input, localScenarios);
    }
  }

  /** Scenarios are derived from model outputs, never trusted from a generated string. */
  private normalise(
    reportScenarios: MarketReportView['scenarios'],
    derived: ReturnType<typeof scenarioSplit>,
  ): MarketReportView['scenarios'] {
    const total = reportScenarios.reduce((sum, item) => sum + item.probability, 0);
    if (total !== 100 || reportScenarios.length !== derived.length) return derived;
    return reportScenarios.map((item, index) => ({
      ...item,
      probability: derived[index].probability,
    }));
  }
}

export { scenarioSplit } from './template';
