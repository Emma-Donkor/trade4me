"""PHASE 13 calibration gate: reliability buckets and method selection."""

from __future__ import annotations

import pytest

from app.ml.calibrate import fit_calibrator
from app.ml.evaluate import calibration_gap, evaluate_predictions, reliability_table


def _miscalibrated_samples() -> tuple[list[int], list[float]]:
    """Raw scores are compressed; labels have 80%/20% true frequencies."""
    labels: list[int] = []
    scores: list[float] = []
    for index in range(500):
        positive_group = index < 250
        labels.append(int(index % 5 < 4) if positive_group else int(index % 5 == 0))
        scores.append(0.65 if positive_group else 0.35)
    return labels, scores


@pytest.mark.parametrize('method', ['platt', 'isotonic'])
def test_calibration_maps_0_8_bucket_within_tolerance(method: str) -> None:
    labels, scores = _miscalibrated_samples()
    calibrator = fit_calibrator(labels, scores, method)
    calibrated = calibrator.predict(scores)
    table = reliability_table(labels, calibrated)
    high_buckets = [row for row in table if float(row['predicted']) >= 0.75]
    assert high_buckets
    observed = sum(float(row['observed']) * int(row['count']) for row in high_buckets) / sum(
        int(row['count']) for row in high_buckets
    )
    assert abs(observed - 0.8) <= 0.10
    assert calibration_gap(table, min_count=5) <= 0.15
    assert all(0.0 <= value <= 1.0 for value in calibrated)


def test_calibration_curve_artifact_shape() -> None:
    labels, scores = _miscalibrated_samples()
    artifact = fit_calibrator(labels, scores, 'isotonic').to_dict()
    assert artifact['method'] == 'isotonic'
    assert len(artifact['curve']) == 10
    assert {row['bucket'] for row in artifact['curve']} == set(range(10))


def test_single_class_validation_is_reported_not_silently_fitted() -> None:
    calibrator = fit_calibrator([0, 0, 0], [0.2, 0.3, 0.4], 'platt')
    assert calibrator.method == 'identity'
    assert calibrator.reason == 'validation slice contains a single class'


def test_evaluate_predictions_reports_all_required_metrics() -> None:
    metrics = evaluate_predictions([1, 0, 1, 0], [0.9, 0.2, 0.6, 0.4])
    for key in ('accuracy', 'precision', 'recall', 'f1', 'rocAuc', 'brier'):
        assert key in metrics
    assert metrics['samples'] == 4
    assert 0.0 <= float(metrics['brier']) <= 1.0
    assert 0.0 <= float(metrics['rocAuc']) <= 1.0
