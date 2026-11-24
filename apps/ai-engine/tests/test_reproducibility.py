"""PHASE 13 reproducibility gate and checksummed artifact loading."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

import app.ml.train as training_module
from app.ml.dataset import Dataset, build_dataset
from app.ml.registry import load_artifact
from app.ml.train import TrainingConfig, run_training
from ml_fixtures import labeled_examples

CONFIG = TrainingConfig(
    horizon='24h',
    threshold_pct=0.30,
    seed=17,
    feature_version='v1.0',
    database_url='postgresql://unused:unused@localhost:5432/unused',
    registry_path='./models',
    train_start='2024-01-01T00:00:00Z',
    validation_start='2024-02-15T00:00:00Z',
    test_start='2024-03-15T00:00:00Z',
    end='2024-04-15T00:00:00Z',
    calibration_method='platt',
    walk_forward=False,
    write_report=False,
)


@pytest.fixture()
def dataset() -> Dataset:
    from app.ml.dataset import CandlePoint, FeatureRow
    from ml_fixtures import utc

    examples = labeled_examples(start=utc(2024, 1, 1), days=105)
    features = [
        FeatureRow(item.symbol, item.timeframe, item.timestamp, 'v1.0', item.features)
        for item in examples
    ]
    # Alternating ±0.5% closes produce both label classes for every split.
    closes = [1.10]
    for index in range(1, len(examples)):
        closes.append(round(closes[-1] * (1.005 if index % 2 else 0.995), 8))
    candles = [
        CandlePoint(item.symbol, item.timeframe, item.timestamp, closes[index])
        for index, item in enumerate(examples)
    ]
    return build_dataset(
        features,
        candles,
        horizon='24h',
        threshold_pct=0.30,
        feature_names=list(examples[0].features),
        version='repro-fixture',
    )


def test_same_seed_and_data_produce_identical_metrics(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, dataset: Dataset
) -> None:
    async def fake_write(*_args: object, **_kwargs: object) -> list[str]:
        return []

    monkeypatch.setattr(training_module, 'write_registry_rows', fake_write)
    config = TrainingConfig(**{**CONFIG.__dict__, 'registry_path': str(tmp_path)})

    first = asyncio.run(run_training(config, dataset))
    second = asyncio.run(run_training(config, dataset))

    keys = ('walkForward', 'baselines', 'comparison', 'selectedModel', 'selectionReason')
    assert json.dumps({key: first[key] for key in keys}, sort_keys=True) == json.dumps(
        {key: second[key] for key in keys}, sort_keys=True
    )
    assert first['datasetChecksum'] == second['datasetChecksum']
    assert first['modelRuns'] == second['modelRuns']


def test_artifact_checksum_is_verified_on_load(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, dataset: Dataset) -> None:
    async def fake_write(*_args: object, **_kwargs: object) -> list[str]:
        return []

    monkeypatch.setattr(training_module, 'write_registry_rows', fake_write)
    config = TrainingConfig(**{**CONFIG.__dict__, 'registry_path': str(tmp_path)})
    asyncio.run(run_training(config, dataset))

    payload, manifest = load_artifact(tmp_path, 'xgboost', '1.0.0')
    assert payload['featureNames'] == list(dataset.feature_names)
    assert manifest['featureVersion'] == 'v1.0'
    assert len(manifest['calibration']['curve']) == 10

    model_file = tmp_path / 'xgboost' / '1.0.0' / 'model.joblib'
    model_file.write_bytes(model_file.read_bytes() + b'tampered')
    with pytest.raises(ValueError, match='checksum mismatch'):
        load_artifact(tmp_path, 'xgboost', '1.0.0')
