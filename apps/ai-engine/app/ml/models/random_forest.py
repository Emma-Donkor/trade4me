"""Balanced random-forest baseline with fully deterministic tree construction."""

from __future__ import annotations

from typing import Sequence

from .base import ModelFit

MODEL_NAME = 'random-forest'
MODEL_VERSION = '1.0.0'


def train_random_forest(
    features: Sequence[Sequence[float]],
    labels: Sequence[int],
    feature_names: Sequence[str],
    seed: int,
) -> ModelFit:
    from sklearn.ensemble import RandomForestClassifier

    hyperparams = {
        'nEstimators': 250,
        'maxDepth': 8,
        'minSamplesLeaf': 5,
        'classWeight': 'balanced_subsample',
        'seed': seed,
    }
    estimator = RandomForestClassifier(
        n_estimators=250,
        max_depth=8,
        min_samples_leaf=5,
        class_weight='balanced_subsample',
        random_state=seed,
        n_jobs=1,
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
