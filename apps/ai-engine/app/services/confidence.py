"""Deterministic confidence, risk and direction scoring for P14 inference.

The calibrated probability is the only probability this service consumes.
Confidence combines the probability's distance from 0.5 with model reliability
(measured during P13 training) and the age of the feature vector.  A stale
vector or a weak probability can only lower confidence, never raise it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

LOW = 'LOW'
MEDIUM = 'MEDIUM'
HIGH = 'HIGH'
EXTREME = 'EXTREME'
LONG = 'LONG'
SHORT = 'SHORT'
NEUTRAL = 'NEUTRAL'

DEFAULT_STALE_AFTER_SECONDS = 300.0
DEFAULT_MAX_AGE_SECONDS = 1_800.0
NEUTRAL_EDGE = 0.02
NEUTRAL_CONFIDENCE = 0.20


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return min(high, max(low, float(value)))


@dataclass(frozen=True)
class ConfidenceInput:
    probability: float
    reliability: float
    ageSeconds: float
    staleAfterSeconds: float = DEFAULT_STALE_AFTER_SECONDS
    maxAgeSeconds: float = DEFAULT_MAX_AGE_SECONDS

    def __post_init__(self) -> None:
        if not 0.0 <= float(self.probability) <= 1.0:
            raise ValueError('probability must be within [0, 1]')
        if self.maxAgeSeconds <= self.staleAfterSeconds:
            raise ValueError('maxAgeSeconds must be greater than staleAfterSeconds')
        if float(self.ageSeconds) < 0:
            raise ValueError('ageSeconds cannot be negative')


def confidence_score(input: ConfidenceInput) -> float:
    """Return a 0..1 confidence; weak/old inputs are deliberately penalised."""
    edge = min(1.0, abs(float(input.probability) - 0.5) * 2.0)
    age = float(input.ageSeconds)
    if age <= input.staleAfterSeconds:
        freshness = 1.0
    elif age >= input.maxAgeSeconds:
        freshness = 0.0
    else:
        freshness = (input.maxAgeSeconds - age) / (
            input.maxAgeSeconds - input.staleAfterSeconds
        )
    return round(_clamp(edge * _clamp(input.reliability) * freshness), 6)


def risk_level(probability: float, confidence: float) -> str:
    """Map probability edge and confidence onto the shared RiskLevel union."""
    edge = abs(float(probability) - 0.5) * 2.0
    if confidence >= 0.70 and edge >= 0.50:
        return LOW
    if confidence >= 0.45 and edge >= 0.20:
        return MEDIUM
    if confidence >= 0.25:
        return HIGH
    return EXTREME


def direction(probability: float, confidence: float) -> str:
    """Return the directional-threshold target, or NEUTRAL when untrustworthy."""
    if confidence < NEUTRAL_CONFIDENCE or abs(float(probability) - 0.5) < NEUTRAL_EDGE:
        return NEUTRAL
    return LONG if float(probability) >= 0.5 else SHORT


def _metric(metrics: Mapping[str, Any], key: str) -> float | None:
    """Find the first numeric value for `key` anywhere in nested run metrics."""
    if key in metrics and isinstance(metrics[key], (int, float)) and not isinstance(metrics[key], bool):
        return float(metrics[key])
    for value in metrics.values():
        if isinstance(value, Mapping):
            found = _metric(value, key)
            if found is not None:
                return found
    return None


def model_reliability(metrics: Mapping[str, Any]) -> float:
    """Blend ROC-AUC and Brier skill into a 0..1 reliability multiplier."""
    roc_auc = _metric(metrics, 'rocAuc')
    brier = _metric(metrics, 'brier')
    roc_skill = _clamp(0.5 if roc_auc is None else roc_auc)
    brier_skill = _clamp(1.0 - 2.0 * (0.25 if brier is None else brier))
    return round(_clamp((roc_skill + brier_skill) / 2.0), 6)
