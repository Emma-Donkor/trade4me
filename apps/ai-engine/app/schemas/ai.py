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


class FeaturesRequest(BaseModel):
    symbol: str
    timeframe: str
    featureVersion: str | None = None


class FeaturesResponse(BaseModel):
    symbol: str
    timeframe: str
    featureVersion: str
    features: dict[str, float]
    timestamp: str


class PredictRequest(BaseModel):
    symbol: str
    timeframe: str
    horizon: int


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
