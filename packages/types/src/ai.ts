import type { ExplainFactor, RiskLevel } from './contracts';
import type { MarketRegime } from './market';

export type AIAnalysisSubjectType = 'SIGNAL' | 'PREDICTION' | 'ASSESSMENT';

/** README §12.2 — every stored explanation is auditable and freshness-tagged. */
export interface AIAnalysis {
  id: string;
  subjectType: AIAnalysisSubjectType;
  subjectId: string;
  summary: string;
  supportingEvidence: Record<string, unknown>;
  contradictingEvidence: Record<string, unknown>;
  explanationText: string;
  llmModel: string;
  payloadHash: string;
  freshnessSeconds: number;
  timestamp: string;
}

/** The *only* verified payload handed to the LLM (no invented numbers). */
export interface ExplanationPayload {
  symbol: string;
  technicalScore: number;
  historicalScore: number;
  newsScore: number;
  modelProbability: number;
  confidence: number;
  risk: RiskLevel;
  marketRegime: MarketRegime;
  riskReward: number;
  dataFreshnessSeconds: number;
  modelVersion: string;
}

/** README §12.3 human-facing explainability format. */
export interface StructuredExplanation {
  decision: string;
  supporting: string[];
  contradicting: string[];
  final: string;
  probability: number;
  confidence: number;
  riskLevel: RiskLevel;
  dataFreshnessSeconds: number;
  modelVersion: string;
  timestamp: string;
  factors: ExplainFactor[];
}

export interface AssistantMessage {
  role: 'USER' | 'ASSISTANT';
  content: string;
  at?: string;
}

export interface AssistantRequest {
  message: string;
  history?: AssistantMessage[];
}

export interface MarketReportScenario {
  label: string;
  probability: number;
}

export interface MarketReport {
  symbol: string;
  summary: string;
  scenarios: MarketReportScenario[];
  decision: string;
  warnings: string[];
  generatedAt: string;
}
