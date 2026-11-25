import type { NoTradeReason, RiskAssessment } from '@ts/types';
import { component, evidence, type ComponentScore } from './component';

const STATUS_SCORE = { PASS: 90, WARN: 65, BLOCK: 10 } as const;

/** P15 is authoritative: its hard gates are carried into P16 unchanged. */
export function scoreRisk(risk: RiskAssessment | null | undefined): ComponentScore {
  if (risk === null || risk === undefined) {
    return component(
      50,
      [],
      [evidence('risk', 'No risk assessment is available for this setup', 'missing')],
      ['INSUFFICIENT_DATA'],
    );
  }
  const score = STATUS_SCORE[risk.status];
  const item = evidence('risk', `Risk verdict is ${risk.status}`, risk.status);
  const reasons = [...(risk.noTradeReasons ?? [])] as NoTradeReason[];
  const blocks = risk.verdicts.filter((verdict) => verdict.status === 'BLOCK').length;
  const riskReward = evidence('risk', `Risk/reward is ${risk.riskReward}`, risk.riskReward);
  return component(
    score,
    risk.status === 'PASS' ? [item, riskReward] : [],
    risk.status !== 'PASS'
      ? [
          item,
          riskReward,
          ...(blocks > 0
            ? [evidence('risk', `${blocks} hard risk rules blocked the setup`, blocks)]
            : []),
        ]
      : [],
    reasons,
  );
}
