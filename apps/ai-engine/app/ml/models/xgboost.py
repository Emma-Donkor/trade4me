"""Primary XGBoost slot: class-weighted, early-stopped, deterministic."""

from __future__ import annotations

from typing import Sequence

from .base import ModelFit

MODEL_NAME = 'xgboost'
MODEL_VERSION = '1.0.0'


def train_xgboost(
    features: Sequence[Sequence[float]],
    labels: Sequence[int],
    feature_names: Sequence[str],
    seed: int,
    *,
    validation_features: Sequence[Sequence[float]] | None = None,
    validation_labels: Sequence[int] | None = None,
) -> ModelFit:
    from xgboost import XGBClassifier

    positives = sum(labels)
    negatives = len(labels) - positives
    scale_pos_weight = negatives / positives if positives > 0 else 1.0
    hyperparams = {
        'nEstimators': 350,
        'maxDepth': 4,
        'learningRate': 0.05,
        'subsample': 0.9,
        'colsampleBytree': 0.9,
        'objective': 'binary:logistic',
        'evalMetric': 'logloss',
        'earlyStoppingRounds': 20,
        'scalePosWeight': round(scale_pos_weight, 6),
        'seed': seed,
    }
    estimator = XGBClassifier(
        n_estimators=350,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        objective='binary:logistic',
        eval_metric='logloss',
        early_stopping_rounds=20,
        random_state=seed,
        n_jobs=1,
        tree_method='hist',
        scale_pos_weight=scale_pos_weight,
    )
    fit_kwargs: dict[str, object] = {'verbose': False}
    if validation_features is not None and validation_labels is not None:
        fit_kwargs['eval_set'] = [(list(validation_features), list(validation_labels))]
    estimator.fit(list(features), list(labels), **fit_kwargs)
    if getattr(estimator, 'best_iteration', None):
        hyperparams['bestIteration'] = int(estimator.best_iteration)
    return ModelFit(
        name=MODEL_NAME,
        version=MODEL_VERSION,
        estimator=estimator,
        hyperparams=hyperparams,
        feature_names=tuple(feature_names),
        seed=seed,
    )
