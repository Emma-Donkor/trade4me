"""Contract shape and 501 behaviour for the four PHASE 03 stub routers."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.routers.explain import ExplainRequest, ExplainResponse
from app.api.routers.features import FeaturesRequest, FeaturesResponse
from app.api.routers.indicators import IndicatorsRequest, IndicatorsResponse
from app.api.routers.predict import PredictRequest, PredictResponse
from app.main import app

client = TestClient(app)

SERVICE_HEADERS = {'X-Service-Token': 'tradesense-dev-service-token'}

STUB_CASES = [
    (
        '/api/v1/ai/features',
        {'symbol': 'EURUSD', 'timeframe': '1h'},
        'Not implemented until PHASE 12',
    ),
    (
        '/api/v1/ai/predict',
        {'symbol': 'EURUSD', 'timeframe': '1h', 'horizon': 5},
        'Not implemented until PHASE 14',
    ),
    (
        '/api/v1/ai/explain',
        {'predictionId': 'prediction-1'},
        'Not implemented until PHASE 17',
    ),
]

MODEL_FIELDS: list[tuple[Any, set[str]]] = [
    (IndicatorsRequest, {'symbol', 'timeframe', 'indicators', 'candles'}),
    (IndicatorsResponse, {'symbol', 'timeframe', 'indicators', 'computedAt'}),
    (FeaturesRequest, {'symbol', 'timeframe', 'featureVersion'}),
    (
        FeaturesResponse,
        {'symbol', 'timeframe', 'featureVersion', 'features', 'timestamp'},
    ),
    (PredictRequest, {'symbol', 'timeframe', 'horizon'}),
    (
        PredictResponse,
        {
            'symbol',
            'timeframe',
            'direction',
            'probability',
            'confidence',
            'riskLevel',
            'modelVersion',
        },
    ),
    (ExplainRequest, {'predictionId'}),
    (ExplainResponse, {'predictionId', 'summary', 'factors'}),
]


@pytest.mark.parametrize(('path', 'payload', 'detail'), STUB_CASES)
def test_stub_endpoints_return_501(path: str, payload: dict[str, Any], detail: str) -> None:
    response = client.post(path, json=payload, headers=SERVICE_HEADERS)

    assert response.status_code == 501
    assert response.json() == {'detail': detail}


@pytest.mark.parametrize(('path', 'payload', '_detail'), STUB_CASES)
def test_internal_routes_require_service_token(
    path: str, payload: dict[str, Any], _detail: str
) -> None:
    assert client.post(path, json=payload).status_code == 401


@pytest.mark.parametrize(('model', 'expected'), MODEL_FIELDS)
def test_model_field_names_are_exact(model: Any, expected: set[str]) -> None:
    assert set(model.model_fields) == expected
