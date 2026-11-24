"""PHASE 14 inference contract, confidence and cache tests.

Inference is exercised with a fake registry/artifact so the tests stay
deterministic and never contact Postgres or the model registry on disk.
"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from app.ml.registry import ActiveModel
from app.services import predict as predict_service
from app.services.feature_manifest import FEATURE_NAMES
from app.services.predict import (
    PredictionError,
    PredictionInput,
    PredictionResult,
    clear_prediction_cache,
    predict,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
README_PATH = REPO_ROOT / 'README.md'
FIXTURES_PATH = REPO_ROOT / 'tests' / 'contracts' / 'fixtures' / 'ai-routes.json'

NOW = datetime(2026, 11, 24, 12, 0, tzinfo=timezone.utc)


class FakeEstimator:
    def __init__(self, probability: float) -> None:
        self.probability = probability

    def predict_proba(self, matrix: list[list[float]]) -> Any:
        return np.asarray([[1.0 - self.probability, self.probability] for _ in matrix])


@pytest.fixture(autouse=True)
def reset_cache() -> None:
    clear_prediction_cache()


def _active(version_id: str = 'active-version-01') -> ActiveModel:
    return ActiveModel(
        id=version_id,
        name='xgboost',
        version='1.0.0',
        feature_version='v1.0',
        dataset_version='dataset-2026-11',
        run_id='run-01',
        artifacts_path='./models/xgboost/1.0.0',
        metrics={'holdout': {'rocAuc': 0.8, 'brier': 0.15}},
    )


def _features() -> dict[str, float]:
    return {name: float(index % 7) / 10.0 for index, name in enumerate(FEATURE_NAMES)}


def _stub_registry(
    monkeypatch: pytest.MonkeyPatch,
    *,
    probability: float = 0.78,
    version_id: str = 'active-version-01',
) -> dict[str, int]:
    active = _active(version_id)
    calls = {'load_active': 0, 'load_artifact': 0}

    async def load_active_model(database_url: str) -> ActiveModel:
        calls['load_active'] += 1
        return active

    def load_artifact(root: str, name: str, version: str) -> tuple[dict[str, Any], dict[str, Any]]:
        calls['load_artifact'] += 1
        assert name == 'xgboost' and version == '1.0.0'
        return (
            {
                'featureNames': list(FEATURE_NAMES),
                'estimator': FakeEstimator(probability),
                'calibrator': object(),
            },
            {
                'featureVersion': 'v1.0',
                'featureNames': list(FEATURE_NAMES),
                'calibration': {'method': 'identity', 'curve': []},
            },
        )

    monkeypatch.setattr(predict_service, 'load_active_model', load_active_model)
    monkeypatch.setattr(predict_service, 'load_artifact', load_artifact)
    return calls


def _request(*, as_of: datetime = NOW, feature_version: str = 'v1.0') -> PredictionInput:
    return PredictionInput(
        symbol='EUR/USD',
        timeframe='H1',
        horizonMinutes=60,
        featureVersion=feature_version,
        asOf=as_of.isoformat().replace('+00:00', 'Z'),
        features=_features(),
    )


def test_serialized_output_matches_readme_13_7_exactly() -> None:
    section = README_PATH.read_text(encoding='utf-8').split('### 13.7')[1]
    documented = json.loads(re.search(r'```json\s*(\{.*?\})\s*```', section, re.DOTALL).group(1))
    result = PredictionResult(
        symbol='EURUSD',
        timeframe='H1',
        direction='LONG',
        probability=0.72,
        confidence=0.74,
        riskLevel='MEDIUM',
        modelVersion='xgb-v1.0.0',
    )
    assert list(result.to_dict()) == list(documented)
    fixture = json.loads(FIXTURES_PATH.read_text(encoding='utf-8'))['PredictResponse']
    assert set(result.to_dict()) == set(fixture['fields'])


def test_predict_emits_only_calibrated_probability(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_registry(monkeypatch)
    result = asyncio.run(predict(_request(), now=NOW, database_url='postgresql://unused'))
    payload = result.to_dict()
    assert payload['symbol'] == 'EUR/USD'
    assert payload['timeframe'] == 'H1'
    assert payload['direction'] in {'LONG', 'SHORT', 'NEUTRAL'}
    assert payload['riskLevel'] in {'LOW', 'MEDIUM', 'HIGH', 'EXTREME'}
    assert payload['modelVersion'] == 'xgboost-1.0.0'
    assert payload['probability'] == pytest.approx(0.78, abs=1e-6)
    assert 0.0 <= payload['confidence'] <= 1.0
    assert len(payload) == 7
    assert not any('guarantee' in str(value).lower() for value in payload.values())


def test_confidence_falls_with_stale_features(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_registry(monkeypatch)
    fresh = asyncio.run(predict(_request(), now=NOW, database_url='postgresql://unused'))
    stale = asyncio.run(
        predict(
            _request(as_of=NOW - timedelta(minutes=15)),
            now=NOW,
            database_url='postgresql://unused',
        )
    )
    assert stale.confidence < fresh.confidence


def test_confidence_falls_with_weak_probability(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_registry(monkeypatch, probability=0.51)
    weak = asyncio.run(predict(_request(), now=NOW, database_url='postgresql://unused'))
    assert weak.confidence < 0.1
    assert weak.direction == 'NEUTRAL'


def test_feature_version_mismatch_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_registry(monkeypatch)
    with pytest.raises(PredictionError) as excinfo:
        asyncio.run(
            predict(_request(feature_version='v0.9'), now=NOW, database_url='postgresql://unused')
        )
    assert excinfo.value.code == 'FEATURE_VERSION_MISMATCH'


def test_cache_is_keyed_by_model_version(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _stub_registry(monkeypatch)
    request = _request()
    asyncio.run(predict(request, now=NOW, database_url='postgresql://unused'))
    asyncio.run(predict(request, now=NOW, database_url='postgresql://unused'))
    assert calls['load_artifact'] == 1

    # Promoting a different model changes the registry id, so the same inputs
    # must never reuse the previous version's cached probability.
    promoted = _stub_registry(monkeypatch, version_id='active-version-02')
    asyncio.run(predict(request, now=NOW, database_url='postgresql://unused'))
    assert promoted['load_artifact'] == 1
