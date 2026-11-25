import { createHash } from 'node:crypto';
import type { ReportPredictionSnapshot } from '@ts/types';
import type {
  AssistantFact,
  AssistantResponse,
  ExplanationRequestV2,
  ExplanationResultV2,
  MarketReportView,
  ReportInput,
} from '@ts/validation';

type EvidenceLike = { source: string; claim: string; value?: unknown };

export const NO_DATA_ANSWER = 'I do not have application data for that question yet.';
export const TEMPLATE_MODEL = 'template-v1';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function hashPayload(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function clean(value: unknown): string {
  return (
    String(value ?? '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

function displayTimestamp(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value);
  return match ? `${match[1]} ${match[2]} UTC` : clean(value);
}

function evidenceLines(items: readonly EvidenceLike[]): string[] {
  const lines = items.map((item) => `• ${clean(item.source)}: ${clean(item.claim)}`);
  return lines.length > 0 ? lines : ['• No verified evidence available'];
}

export function scenarioSplit(
  prediction: ReportPredictionSnapshot | null,
): Array<{ label: string; probability: number }> {
  if (prediction === null) {
    return [
      { label: 'Bullish', probability: 34 },
      { label: 'Neutral', probability: 33 },
      { label: 'Bearish', probability: 33 },
    ];
  }
  const certain = Math.round(Math.max(0, Math.min(1, prediction.probability)) * 100);
  const remainder = 100 - certain;
  if (prediction.direction === 'LONG') {
    const bearish = Math.round(remainder * 0.6);
    return [
      { label: 'Bullish', probability: certain },
      { label: 'Neutral', probability: 100 - certain - bearish },
      { label: 'Bearish', probability: bearish },
    ];
  }
  if (prediction.direction === 'SHORT') {
    const bullish = Math.round(remainder * 0.6);
    return [
      { label: 'Bullish', probability: bullish },
      { label: 'Neutral', probability: 100 - certain - bullish },
      { label: 'Bearish', probability: certain },
    ];
  }
  const bullish = Math.floor(remainder / 2);
  return [
    { label: 'Bullish', probability: bullish },
    { label: 'Neutral', probability: certain },
    { label: 'Bearish', probability: 100 - certain - bullish },
  ];
}

/** Keyless Node-side fallback used only when the Python engine itself is down. */
export function templateExplanation(input: ExplanationRequestV2): ExplanationResultV2 {
  const payload = input.payload;
  const probability = Math.round(payload.modelProbability * 100);
  const confidence = Math.round(payload.confidence);
  const decision = clean(input.decision) || 'WATCH';
  const supporting = input.supportingEvidence.map(
    (item) => `${clean(item.source)}: ${clean(item.claim)}`,
  );
  const contradicting = input.contradictingEvidence.map(
    (item) => `${clean(item.source)}: ${clean(item.claim)}`,
  );
  const explanationText = [
    'DECISION',
    decision,
    '',
    'SUPPORTING',
    ...evidenceLines(input.supportingEvidence),
    '',
    'CONTRADICTING',
    ...evidenceLines(input.contradictingEvidence),
    '',
    'FINAL',
    decision,
    '',
    `Probability: ${probability}%`,
    `Confidence: ${confidence}/100`,
    `Risk: ${payload.risk}`,
    `Data freshness: ${payload.dataFreshnessSeconds}s`,
    `Model: ${payload.modelVersion}`,
    `Timestamp: ${displayTimestamp(input.timestamp)}`,
  ].join('\n');

  return {
    predictionId: input.predictionId,
    decision,
    supporting: supporting.length > 0 ? supporting : ['No verified evidence available'],
    contradicting: contradicting.length > 0 ? contradicting : ['No verified evidence available'],
    final: decision,
    probability,
    confidence,
    riskLevel: payload.risk,
    dataFreshnessSeconds: payload.dataFreshnessSeconds,
    modelVersion: payload.modelVersion,
    timestamp: input.timestamp,
    factors: input.supportingEvidence.slice(0, 12).map((item) => ({
      name: clean(item.source) || 'evidence',
      impact: typeof item.value === 'number' && Number.isFinite(item.value) ? item.value : 0,
    })),
    summary: decision,
    explanationText,
    explanationSource: 'template',
    llmModel: TEMPLATE_MODEL,
    payloadHash: hashPayload({
      payload,
      decision,
      sources: [...supporting, ...contradicting, ...input.reasons],
      timestamp: input.timestamp,
    }),
    validation: { valid: true, violations: [], attempts: 0 },
  };
}

/** Keyless Node-side report renderer, mirroring the Python template contract. */
export function templateReport(
  input: ReportInput,
  scenarios: ReturnType<typeof scenarioSplit>,
): MarketReportView {
  const explanationText = [
    `MARKET REPORT ${clean(input.symbol)}`,
    `SUMMARY: ${clean(input.summary)}`,
    `TREND: ${clean(input.trend)}`,
    `TECHNICAL EVIDENCE: ${evidenceLines(input.technicalEvidence).join('; ')}`,
    `HISTORICAL EVIDENCE: ${evidenceLines(input.historicalEvidence).join('; ')}`,
    `NEWS EVIDENCE: ${evidenceLines(input.newsEvidence).join('; ')}`,
    'SCENARIO ANALYSIS (probabilities, not certainties)',
    ...scenarios.map((item) => `${item.label} — ${item.probability}% (probability)`),
    `DECISION: ${clean(input.decision)}`,
    'REASONS:',
    ...evidenceLines(
      input.reasons.map((reason) => ({ source: 'decision', claim: reason, value: null })),
    ),
    'WARNINGS:',
    ...evidenceLines(
      input.warnings.map((warning) => ({ source: 'risk', claim: warning, value: null })),
    ),
  ].join('\n');

  return {
    symbol: input.symbol,
    summary: clean(input.summary),
    scenarios,
    decision: input.decision,
    warnings: input.warnings,
    generatedAt: input.asOf,
    trend: input.trend,
    technicalEvidence: input.technicalEvidence,
    historicalEvidence: input.historicalEvidence,
    newsEvidence: input.newsEvidence,
    prediction: input.prediction,
    risk: input.risk,
    reasons: input.reasons,
    explanationText,
    explanationSource: 'template',
    llmModel: TEMPLATE_MODEL,
    payloadHash: hashPayload(input),
  };
}

export function templateAssistant(facts: readonly AssistantFact[]): AssistantResponse {
  if (facts.length === 0) {
    return {
      answer: NO_DATA_ANSWER,
      sources: [],
      grounded: true,
      hasData: false,
      explanationSource: 'none',
      llmModel: TEMPLATE_MODEL,
    };
  }
  const answer = [
    'Based on application data:',
    ...facts
      .slice(0, 12)
      .map((fact) => `• ${clean(fact.symbol)} ${clean(fact.label)}: ${clean(fact.value)}`),
    'I have not added any information beyond these application facts.',
  ].join('\n');
  return {
    answer,
    sources: [...facts],
    grounded: true,
    hasData: true,
    explanationSource: 'template',
    llmModel: TEMPLATE_MODEL,
  };
}
