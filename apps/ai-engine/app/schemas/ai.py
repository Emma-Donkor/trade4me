"""Pydantic mirrors of the TypeScript AI boundary contracts (PHASE 05).

`packages/types/src/contracts.ts` is the source of truth; the fixture-based
parity test keeps these field sets identical across both languages.
"""

from __future__ import annotations

from pydantic import BaseModel


class IndicatorCandle(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


class IndicatorsRequest(BaseModel):
    symbol: str
    timeframe: str
    indicators: list[str] | None = None
    candles: list[IndicatorCandle] | None = None


class IndicatorsResponse(BaseModel):
    symbol: str
    timeframe: str
    indicators: dict[str, object]
    computedAt: str


class FeatureInputCandle(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


class FeatureNewsInput(BaseModel):
    publishedAt: str
    currencies: list[str] | None = None
    affectedPairs: list[str] | None = None
    sentiment: str
    impact: str
    confidence: float | None = None


class FeatureEventInput(BaseModel):
    scheduledAt: str
    currency: str
    impact: str


class RegimeInput(BaseModel):
    regime: str
    confidence: float
    evidence: dict[str, object] | None = None


class FeaturesRequest(BaseModel):
    symbol: str
    timeframe: str
    featureVersion: str | None = None
    asOf: str
    candles: list[FeatureInputCandle]
    peerCandles: dict[str, list[FeatureInputCandle]] | None = None
    news: list[FeatureNewsInput] | None = None
    events: list[FeatureEventInput] | None = None
    regime: RegimeInput | None = None
    timestamps: list[str] | None = None


class FeatureVectorItem(BaseModel):
    timestamp: str
    features: dict[str, float]


class FeaturesResponse(BaseModel):
    symbol: str
    timeframe: str
    featureVersion: str
    features: dict[str, float]
    timestamp: str
    vectors: list[FeatureVectorItem]


class PredictRequest(BaseModel):
    symbol: str
    timeframe: str
    horizon: int
    featureVersion: str
    asOf: str
    features: dict[str, float]


class PredictResponse(BaseModel):
    symbol: str
    timeframe: str
    direction: str
    probability: float
    confidence: float
    riskLevel: str
    modelVersion: str


class ExplainRequest(BaseModel):
    predictionId: str


class ExplainFactor(BaseModel):
    name: str
    impact: float


class ExplainResponse(BaseModel):
    predictionId: str
    summary: str
    factors: list[ExplainFactor]


# ─────────────────────────── PHASE 17 ───────────────────────────

class EvidenceItemInput(BaseModel):
    source: str
    claim: str
    value: object | None = None


class ExplanationPayloadInput(BaseModel):
    """The only verified facts handed to a language model (README §12.2)."""

    symbol: str
    technicalScore: float
    historicalScore: float
    newsScore: float
    modelProbability: float
    confidence: float
    risk: str
    marketRegime: str
    riskReward: float
    dataFreshnessSeconds: float
    modelVersion: str


class ExplanationRequestV2(BaseModel):
    predictionId: str
    payload: ExplanationPayloadInput
    decision: str
    supportingEvidence: list[EvidenceItemInput]
    contradictingEvidence: list[EvidenceItemInput]
    reasons: list[str]
    noTradeReasons: list[str]
    timestamp: str


class ExplanationValidationResult(BaseModel):
    valid: bool
    violations: list[str]
    attempts: int


class ExplanationResponseV2(BaseModel):
    predictionId: str
    decision: str
    supporting: list[str]
    contradicting: list[str]
    final: str
    probability: float
    confidence: float
    riskLevel: str
    dataFreshnessSeconds: float
    modelVersion: str
    timestamp: str
    factors: list[ExplainFactor]
    summary: str
    explanationText: str
    explanationSource: str
    llmModel: str
    payloadHash: str
    validation: ExplanationValidationResult


class ReportPredictionSnapshot(BaseModel):
    direction: str
    probability: float
    confidence: float
    riskLevel: str
    modelVersion: str


class ReportRiskSnapshot(BaseModel):
    level: str
    reasons: list[str]
    riskReward: float | None = None


class ReportRequest(BaseModel):
    symbol: str
    asOf: str
    summary: str
    trend: str
    technicalEvidence: list[EvidenceItemInput]
    historicalEvidence: list[EvidenceItemInput]
    newsEvidence: list[EvidenceItemInput]
    prediction: ReportPredictionSnapshot | None = None
    risk: ReportRiskSnapshot | None = None
    decision: str
    reasons: list[str]
    warnings: list[str]


class ReportScenario(BaseModel):
    label: str
    probability: int


class ReportResponse(BaseModel):
    symbol: str
    summary: str
    scenarios: list[ReportScenario]
    decision: str
    warnings: list[str]
    generatedAt: str
    trend: str
    technicalEvidence: list[EvidenceItemInput]
    historicalEvidence: list[EvidenceItemInput]
    newsEvidence: list[EvidenceItemInput]
    prediction: ReportPredictionSnapshot | None = None
    risk: ReportRiskSnapshot | None = None
    reasons: list[str]
    explanationText: str
    explanationSource: str
    llmModel: str
    payloadHash: str


class AssistantFactInput(BaseModel):
    kind: str
    symbol: str
    label: str
    value: str
    observedAt: str | None = None


class AssistantRequestV2(BaseModel):
    message: str
    facts: list[AssistantFactInput]
    history: list[dict[str, str]] | None = None


class AssistantResponseV2(BaseModel):
    answer: str
    sources: list[AssistantFactInput]
    grounded: bool
    hasData: bool
    explanationSource: str
    llmModel: str


class NewsEnhancerRequest(BaseModel):
    title: str
    text: str
    affectedPairs: list[str] | None = None
    ruleClassification: dict[str, object]


class NewsEnhancerResponse(BaseModel):
    eventType: str
    sentiment: str
    impact: str
    confidence: float
    analyzedBy: str
