import type { ExplainFactor, RiskLevel } from './contracts';
import type { MarketRegime } from './market';
import type { EvidenceItem } from './signal';

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

// ─────────────────────────── PHASE 17 ───────────────────────────

export type ExplanationSource = 'template' | 'llm' | 'none';

/** The only structured data an LLM is allowed to narrate (no raw textures). */
export interface ExplanationRequest {
  predictionId: string;
  payload: ExplanationPayload;
  decision: string;
  supportingEvidence: EvidenceItem[];
  contradictingEvidence: EvidenceItem[];
  reasons: string[];
  noTradeReasons: string[];
  timestamp: string;
}

export interface ExplanationValidation {
  valid: boolean;
  violations: string[];
  attempts: number;
}

/** README §12.3 — a fully grounded, auditable explanation. */
export interface ExplanationResult extends StructuredExplanation {
  predictionId: string;
  summary: string;
  explanationText: string;
  explanationSource: ExplanationSource;
  llmModel: string;
  payloadHash: string;
  validation: ExplanationValidation;
}

export interface ReportPredictionSnapshot {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  probability: number;
  confidence: number;
  riskLevel: RiskLevel;
  modelVersion: string;
}

export interface ReportInput {
  symbol: string;
  asOf: string;
  summary: string;
  trend: string;
  technicalEvidence: EvidenceItem[];
  historicalEvidence: EvidenceItem[];
  newsEvidence: EvidenceItem[];
  prediction: ReportPredictionSnapshot | null;
  risk: { level: RiskLevel; reasons: string[]; riskReward?: number } | null;
  decision: string;
  reasons: string[];
  warnings: string[];
}

export interface MarketReportView extends MarketReport {
  trend: string;
  technicalEvidence: EvidenceItem[];
  historicalEvidence: EvidenceItem[];
  newsEvidence: EvidenceItem[];
  prediction: ReportPredictionSnapshot | null;
  risk: { level: RiskLevel; reasons: string[]; riskReward?: number } | null;
  reasons: string[];
  explanationText: string;
  explanationSource: ExplanationSource;
  llmModel: string;
  payloadHash: string;
}

export type AssistantFactKind = 'ASSESSMENT' | 'INDICATOR' | 'NEWS' | 'SIGNAL' | 'NO_TRADE';

/** Retrieval-first facts: every value came from the application DB/cache. */
export interface AssistantFact {
  kind: AssistantFactKind;
  symbol: string;
  label: string;
  value: string;
  observedAt?: string;
}

export interface AssistantResponse {
  answer: string;
  sources: AssistantFact[];
  grounded: boolean;
  hasData: boolean;
  explanationSource: ExplanationSource;
  llmModel: string;
}

export interface NewsEnhancerInput {
  title: string;
  text: string;
  affectedPairs?: string[];
  /** Rule-based P11 classification that the enhancer may refine, never replace ad-hoc. */
  ruleClassification: Record<string, unknown>;
}

export interface NewsEnhancerResult {
  eventType: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  confidence: number;
  analyzedBy: string;
}
