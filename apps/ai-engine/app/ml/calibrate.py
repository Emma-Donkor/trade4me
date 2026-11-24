"""Platt/isotonic calibration fitted on a validation slice only.

Test folds never participate in calibration.  The calibrated probability is
the only probability exported by the pipeline.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from .evaluate import reliability_table

_EPSILON = 1e-6


@dataclass(frozen=True)
class Calibrator:
    """Wraps a fitted calibrator with its curve and deterministic method name."""

    method: str
    predictor: Any
    curve: tuple[dict[str, float | int], ...]
    reason: str | None = None

    def predict(self, probabilities: Sequence[float]) -> list[float]:
        clipped = [min(1 - _EPSILON, max(_EPSILON, float(value))) for value in probabilities]
        if self.method == 'platt':
            logits = [[math.log(value / (1 - value))] for value in clipped]
            return [float(value) for value in self.predictor.predict_proba(logits)[:, 1]]
        if self.method == 'isotonic':
            return [float(value) for value in self.predictor.predict(clipped)]
        return clipped

    def to_dict(self) -> dict[str, Any]:
        return {
            'method': self.method,
            'curve': list(self.curve),
            'reason': self.reason,
        }


def fit_calibrator(
    y_true: Sequence[int],
    y_probability: Sequence[float],
    method: str = 'platt',
    *,
    buckets: int = 10,
) -> Calibrator:
    """Fit Platt scaling or isotonic regression on validation labels only."""
    if method not in {'platt', 'isotonic'}:
        raise ValueError(f'unsupported calibration method {method!r}')
    labels = [int(value) for value in y_true]
    raw = [min(1 - _EPSILON, max(_EPSILON, float(value))) for value in y_probability]
    if len(labels) != len(raw) or not labels:
        raise ValueError('calibration inputs must be non-empty and equal length')

    if len(set(labels)) < 2:
        return Calibrator(
            method='identity',
            predictor=None,
            curve=tuple(reliability_table(labels, raw, buckets)),
            reason='validation slice contains a single class',
        )

    if method == 'platt':
        from sklearn.linear_model import LogisticRegression

        predictor: Any = LogisticRegression(C=1e6, max_iter=1000, solver='lbfgs')
        logits = [[math.log(value / (1 - value))] for value in raw]
        predictor.fit(logits, labels)
        calibrated = [float(value) for value in predictor.predict_proba(logits)[:, 1]]
    else:
        from sklearn.isotonic import IsotonicRegression

        predictor = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds='clip')
        predictor.fit(raw, labels)
        calibrated = [float(value) for value in predictor.predict(raw)]

    return Calibrator(
        method=method,
        predictor=predictor,
        curve=tuple(reliability_table(labels, calibrated, buckets)),
    )


def calibrator_from_artifact(
    payload: Mapping[str, Any], manifest: Mapping[str, Any]
) -> Calibrator:
    """Rebuild the fitted calibrator from a checksum-verified artifact.

    Only the manifest's calibration metadata is trusted for the method/curve;
    the fitted predictor itself lives in the joblib payload written by P13.
    """
    calibration = manifest.get('calibration') or {}
    curve = tuple(calibration.get('curve') or ())
    return Calibrator(
        method=str(calibration.get('method') or 'identity'),
        predictor=payload.get('calibrator'),
        curve=curve,
        reason=calibration.get('reason'),
    )
