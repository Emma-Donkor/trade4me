"""PHASE 14 drift-detector tests over resolved outcomes only."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.drift import (
    DRIFT_WARNING,
    HEALTHY,
    DriftConfig,
    OutcomePoint,
    detect_drift,
)

BASE = datetime(2026, 11, 1, tzinfo=timezone.utc)
CONFIG = DriftConfig(minSamples=20, recentWindow=50, accuracyDrop=0.10, brierIncrease=0.05)


def _points(
    *,
    count: int,
    accuracy: float,
    confident: float,
    start: datetime,
) -> list[OutcomePoint]:
    """Deterministic points: `accuracy` share land on the predicted class."""
    correct = round(count * accuracy)
    points: list[OutcomePoint] = []
    for index in range(count):
        predicts_long = index < correct
        if index < correct:
            label = 1 if predicts_long else 0
        else:
            label = 0 if predicts_long else 1
        probability = confident if predicts_long else 1.0 - confident
        points.append(
            OutcomePoint(
                probability=probability,
                label=label,
                createdAt=(start + timedelta(minutes=index)).isoformat(),
            )
        )
    return points


DEGRADATION_CONFIG = DriftConfig(
    minSamples=20, recentWindow=100, accuracyDrop=0.10, brierIncrease=0.05
)


def test_68_to_51_degradation_triggers_drift_warning() -> None:
    historical = _points(count=100, accuracy=0.68, confident=0.9, start=BASE)
    recent = _points(
        count=100, accuracy=0.51, confident=0.9, start=BASE + timedelta(days=1)
    )
    report = detect_drift(
        historical + recent, config=DEGRADATION_CONFIG, modelVersion='xgboost-1.0.0'
    )
    assert report.status == DRIFT_WARNING
    assert report.historicalAccuracy == 0.68
    assert report.recentAccuracy == 0.51
    assert report.samples == 200
    assert 'accuracy degraded' in (report.reason or '')


def test_small_noise_does_not_trigger_drift() -> None:
    historical = _points(count=100, accuracy=0.68, confident=0.9, start=BASE)
    recent = _points(count=50, accuracy=0.66, confident=0.9, start=BASE + timedelta(days=1))
    report = detect_drift(historical + recent, config=CONFIG)
    assert report.status == HEALTHY
    assert report.reason is None
    assert report.historicalBrier - report.recentBrier < CONFIG.brierIncrease
    assert report.recentBrier - report.historicalBrier < CONFIG.brierIncrease


def test_brier_degradation_alone_triggers_drift() -> None:
    historical = _points(count=100, accuracy=0.68, confident=0.68, start=BASE)
    # Same argmax accuracy, but overconfident wrong answers ruin calibration.
    recent = [
        OutcomePoint(
            probability=0.5 if index < 34 else 0.99,
            label=1 if index < 34 else 0,
            createdAt=(BASE + timedelta(days=1, minutes=index)).isoformat(),
        )
        for index in range(50)
    ]
    report = detect_drift(historical + recent, config=CONFIG)
    assert report.status == DRIFT_WARNING
    assert report.historicalAccuracy == report.recentAccuracy
    assert 'Brier' in (report.reason or '')


def test_insufficient_outcomes_never_warn() -> None:
    points = _points(count=8, accuracy=0.2, confident=0.9, start=BASE)
    report = detect_drift(points, config=CONFIG)
    assert report.status == HEALTHY
    assert report.samples == 8
    assert report.reason == 'insufficient resolved outcomes'


def test_points_are_ordered_by_timestamp_not_input_order() -> None:
    ordered = _points(count=100, accuracy=0.68, confident=0.9, start=BASE)
    noisy_recent = _points(
        count=100, accuracy=0.51, confident=0.9, start=BASE + timedelta(days=1)
    )
    shuffled = list(reversed(ordered + noisy_recent))
    report = detect_drift(shuffled, config=DEGRADATION_CONFIG)
    assert report.status == DRIFT_WARNING
    assert report.historicalAccuracy == 0.68
    assert report.recentAccuracy == 0.51
