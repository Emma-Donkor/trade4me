"""Phase 14 inference: live features -> calibrated, auditable prediction.

The ACTIVE model and its exact feature version are resolved from the registry,
never from configuration alone.  The estimator only sees vectors validated
against the committed manifest, and only the P13-calibrated probability leaves
this module.  A short in-process cache is keyed by symbol *and* model version
so promoting a new model can never serve a stale prediction.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from ..config import settings
from ..ml.calibrate import calibrator_from_artifact
from ..ml.dataset import parse_horizon, parse_timestamp
from ..ml.registry import load_active_model, load_artifact
from .confidence import (
    ConfidenceInput,
    confidence_score,
    direction,
    model_reliability,
    risk_level,
)
from .feature_manifest import validate_vector

PREDICTION_CACHE_TTL_SECONDS = 300
_CACHE: dict[tuple[object, ...], tuple[float, dict[str, Any]]] = {}


class PredictionError(Exception):
    """Domain failure carrying a stable code for the internal route."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class PredictionInput:
    symbol: str
    timeframe: str
    horizonMinutes: int
    featureVersion: str
    asOf: str
    features: Mapping[str, float]


@dataclass(frozen=True)
class PredictionResult:
    symbol: str
    timeframe: str
    direction: str
    probability: float
    confidence: float
    riskLevel: str
    modelVersion: str

    def to_dict(self) -> dict[str, Any]:
        return {
            'symbol': self.symbol,
            'timeframe': self.timeframe,
            'direction': self.direction,
            'probability': self.probability,
            'confidence': self.confidence,
            'riskLevel': self.riskLevel,
            'modelVersion': self.modelVersion,
        }


def clear_prediction_cache() -> None:
    """Test/ops hook; a promoted model also changes the key naturally."""
    _CACHE.clear()


def _age_seconds(as_of: str, now: datetime) -> float:
    vector_time = parse_timestamp(as_of)
    if vector_time.tzinfo is None:
        vector_time = vector_time.replace(tzinfo=timezone.utc)
    return max(0.0, (now - vector_time).total_seconds())


async def predict(
    request: PredictionInput,
    *,
    now: datetime | None = None,
    database_url: str | None = None,
    registry_path: str | None = None,
    threshold_pct: float | None = None,
) -> PredictionResult:
    """Produce one structured prediction from already-fetched exact inputs."""
    if threshold_pct is None:
        threshold_pct = settings.PREDICTION_THRESHOLD
    if threshold_pct <= 0:
        raise PredictionError('INVALID_THRESHOLD', 'prediction threshold must be positive')
    horizon_minutes = parse_horizon(request.horizonMinutes)

    active = await load_active_model(database_url or settings.DATABASE_URL)
    if request.featureVersion != active.feature_version:
        raise PredictionError(
            'FEATURE_VERSION_MISMATCH',
            f'ACTIVE model requires feature version {active.feature_version}',
        )

    model_version = f'{active.name}-{active.version}'
    cache_key = (
        request.symbol,
        request.timeframe,
        horizon_minutes,
        active.id,
        request.featureVersion,
        request.asOf,
    )
    cached = _CACHE.get(cache_key)
    if cached is not None and time.monotonic() - cached[0] < PREDICTION_CACHE_TTL_SECONDS:
        return PredictionResult(**cached[1])

    payload, manifest = load_artifact(
        registry_path or settings.MODEL_REGISTRY_PATH, active.name, active.version
    )
    features = validate_vector(request.features, version=manifest['featureVersion'])
    feature_names: Sequence[str] = tuple(str(name) for name in manifest['featureNames'])
    matrix = [[float(features[name]) for name in feature_names]]
    estimator = payload['estimator']
    try:
        raw = float(estimator.predict_proba(matrix)[:, 1][0])
    except (AttributeError, IndexError, TypeError) as exc:
        raise PredictionError('MODEL_INFERENCE_FAILED', 'model cannot emit probabilities') from exc

    calibrator = calibrator_from_artifact(payload, manifest)
    probability = float(calibrator.predict([raw])[0])
    confidence = confidence_score(
        ConfidenceInput(
            probability=probability,
            reliability=model_reliability(active.metrics),
            ageSeconds=_age_seconds(request.asOf, now or datetime.now(timezone.utc)),
        )
    )
    result = PredictionResult(
        symbol=request.symbol,
        timeframe=request.timeframe,
        direction=direction(probability, confidence),
        probability=round(probability, 6),
        confidence=confidence,
        riskLevel=risk_level(probability, confidence),
        modelVersion=model_version,
    )
    _CACHE[cache_key] = (time.monotonic(), result.to_dict())
    return result
