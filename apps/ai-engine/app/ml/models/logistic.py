"""Balanced logistic-regression baseline with a deterministic scaling pipeline."""

from __future__ import annotations

from typing import Sequence

from .base import ModelFit

MODEL_NAME = 'logistic-regression'
MODEL_VERSION = '1.0.0'


def train_logistic(
    features: Sequence[Sequence[float]],
    labels: Sequence[int],
    feature_names: Sequence[str],
    seed: int,
) -> ModelFit:
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    hyperparams = {
        'classWeight': 'balanced',
        'maxIter': 1000,
        'solver': 'lbfgs',
        'seed': seed,
    }
    estimator = Pipeline(
        [
            ('scaler', StandardScaler()),
            (
                'classifier',
                LogisticRegression(
                    class_weight='balanced', max_iter=1000, solver='lbfgs', random_state=seed
                ),
            ),
        ]
    )
    estimator.fit(list(features), list(labels))
    return ModelFit(
        name=MODEL_NAME,
        version=MODEL_VERSION,
        estimator=estimator,
        hyperparams=hyperparams,
        feature_names=tuple(feature_names),
        seed=seed,
    )
