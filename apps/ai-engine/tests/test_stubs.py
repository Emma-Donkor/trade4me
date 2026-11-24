"""Contract shape and 501 behaviour for the four PHASE 03 stub routers."""

from __future__ import annotations

from typing import Any

import pytest
from app.api.routers.explain import ExplainRequest, ExplainResponse
from app.api.routers.features import FeaturesRequest, FeaturesResponse
from app.api.routers.indicators import IndicatorsRequest, IndicatorsResponse
from app.api.routers.predict import PredictRequest, PredictResponse
from app.main import app
from app.schemas import TrainRequest, TrainResponse
from fastapi.testclient import TestClient  # pyright: ignore[reportMissingImports]

client = TestClient(app)

SERVICE_HEADERS = {'X-Service-Token': 'tradesense-dev-service-token'}

STUB_CASES = [
    (
        '/api/v1/ai/explain',
        {'predictionId': 'prediction-1'},
        'Not implemented until PHASE 17',
    ),
]

MODEL_FIELDS: list[tuple[Any, set[str]]] = [
    (IndicatorsRequest, {'symbol', 'timeframe', 'indicators', 'candles'}),
    (IndicatorsResponse, {'symbol', 'timeframe', 'indicators', 'computedAt'}),
    (
        FeaturesRequest,
        {
            'symbol',
            'timeframe',
            'featureVersion',
            'asOf',
            'candles',
            'peerCandles',
            'news',
            'events',
            'regime',
            'timestamps',
        },
    ),
    (
        FeaturesResponse,
        {
            'symbol',
            'timeframe',
            'featureVersion',
            'features',
            'timestamp',
            'vectors',
        },
    ),
    (
        PredictRequest,
        {'symbol', 'timeframe', 'horizon', 'featureVersion', 'asOf', 'features'},
    ),
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
    (
        TrainRequest,
        {
            'horizon',
            'threshold',
            'seed',
            'featureVersion',
            'symbols',
            'timeframes',
            'trainStart',
            'validationStart',
            'testStart',
            'end',
            'calibrationMethod',
            'walkForward',
            'registryPath',
            'reportPath',
            'writeReport',
        },
    ),
    (
        TrainResponse,
        {
            'datasetVersion',
            'datasetChecksum',
            'datasetRows',
            'featureVersion',
            'selectedModel',
            'selectedVersion',
            'selectionReason',
            'xgboostGatePassed',
            'calibrationMethod',
            'modelRuns',
            'models',
            'comparison',
            'walkForward',
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


@pytest.mark.parametrize(
    ('path', 'payload'),
    [
        ('/api/v1/ai/predict', {'symbol': 'EUR/USD', 'timeframe': 'H1', 'horizon': 5}),
        ('/api/v1/ai/explain', {'predictionId': 'prediction-1'}),
        ('/api/v1/ai/ml/drift', {}),
    ],
)
def test_internal_routes_require_service_token(path: str, payload: dict[str, Any]) -> None:
    assert client.post(path, json=payload).status_code == 401


@pytest.mark.parametrize(('model', 'expected'), MODEL_FIELDS)
def test_model_field_names_are_exact(model: Any, expected: set[str]) -> None:
    assert set(model.model_fields) == expected
