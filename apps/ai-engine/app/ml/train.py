"""One pipeline, three model slots, one comparison report, one registry.

Every run is deterministic for a fixed seed and dataset checksum.  Training
never shuffles rows; calibration is fitted on a chronological validation slice
and never on a test fold.
"""

from __future__ import annotations

import asyncio
import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from collections.abc import Callable, Mapping, Sequence

from ..config import settings
from ..services.feature_manifest import FEATURE_NAMES
from .calibrate import Calibrator, fit_calibrator
from .dataset import Dataset, build_dataset, load_market_rows, parse_horizon
from .evaluate import comparison_rows, evaluate_predictions, reliability_table
from .models.base import ModelFit
from .models.logistic import MODEL_NAME as LR_NAME, train_logistic
from .models.random_forest import MODEL_NAME as RF_NAME, train_random_forest
from .models.xgboost import MODEL_NAME as XGB_NAME, train_xgboost
from .registry import save_artifact, write_registry_rows
from .split import chronological_splits, labels, matrix

NUMERIC_METRICS = ('accuracy', 'precision', 'recall', 'f1', 'rocAuc', 'brier', 'logLoss')


@dataclass(frozen=True)
class TrainingConfig:
    """All knobs are explicit so a run can be replayed byte-for-byte."""

    horizon: str = '24h'
    threshold_pct: float = 0.30
    seed: int = 42
    feature_version: str = settings.FEATURE_VERSION
    database_url: str = settings.DATABASE_URL
    registry_path: str = settings.MODEL_REGISTRY_PATH
    symbols: tuple[str, ...] | None = None
    timeframes: tuple[str, ...] | None = None
    train_start: str | None = None
    validation_start: str | None = None
    test_start: str | None = None
    end: str | None = None
    calibration_method: str = 'platt'
    walk_forward: bool = settings.WALK_FORWARD_ENABLED
    dataset_path: str | None = None
    write_report: bool = True
    report_path: str = 'docs/ml-comparison.md'
    write_registry: bool = True


@dataclass(frozen=True)
class _FoldEvaluation:
    fold: str
    train_range: dict[str, str]
    test_range: dict[str, str]
    metrics: dict[str, Any]
    calibration_method: str


def _sigmoid(value: float) -> float:
    return 1 / (1 + math.exp(-value))


def _mean_metrics(results: Sequence[_FoldEvaluation]) -> dict[str, float | int]:
    if not results:
        raise ValueError('cannot average zero folds')
    averaged: dict[str, float | int] = {'folds': len(results)}
    for key in NUMERIC_METRICS:
        values = [float(item.metrics[key]) for item in results]
        averaged[key] = round(sum(values) / len(values), 6)
    return averaged


def _inner_split(
    rows: Sequence[Any], fraction: float = 0.2
) -> tuple[list[Any], list[Any]]:
    """Chronological inner fit/validation split; never a random sample."""
    if len(rows) < 10:
        return list(rows), []
    count = max(5, int(len(rows) * fraction))
    return list(rows[:-count]), list(rows[-count:])


def _train_one(
    name: str,
    fit_rows: Sequence[Any],
    validation_rows: Sequence[Any],
    test_rows: Sequence[Any],
    feature_names: Sequence[str],
    seed: int,
    calibration_method: str = 'platt',
) -> tuple[ModelFit, Calibrator, dict[str, Any]]:
    trainer: Callable[..., ModelFit]
    if name == LR_NAME:
        trainer = train_logistic
    elif name == RF_NAME:
        trainer = train_random_forest
    elif name == XGB_NAME:
        trainer = train_xgboost
    else:
        raise ValueError(f'unknown model {name!r}')

    x_fit, y_fit = matrix(fit_rows, feature_names), labels(fit_rows)
    x_validation, y_validation = matrix(validation_rows, feature_names), labels(validation_rows)
    x_test, y_test = matrix(test_rows, feature_names), labels(test_rows)

    kwargs: dict[str, Any] = {}
    if name == XGB_NAME and x_validation:
        kwargs = {'validation_features': x_validation, 'validation_labels': y_validation}
    fit = trainer(x_fit, y_fit, feature_names, seed, **kwargs)

    if x_validation:
        raw_validation = [float(value) for value in fit.estimator.predict_proba(x_validation)[:, 1]]
        calibrator = fit_calibrator(
            y_validation, raw_validation, calibration_method, buckets=10
        )
        raw_test = [float(value) for value in fit.estimator.predict_proba(x_test)[:, 1]]
        calibrated = calibrator.predict(raw_test)
    else:
        calibrator = fit_calibrator([0, 1], [0.49, 0.51], calibration_method)
        calibrated = [float(value) for value in fit.estimator.predict_proba(x_test)[:, 1]]

    metrics = evaluate_predictions(y_test, calibrated)
    metrics['reliability'] = reliability_table(y_test, calibrated)
    return fit, calibrator, metrics


def _baseline_probabilities(name: str, rows: Sequence[Any]) -> list[float]:
    if name == 'always-negative':
        return [0.01 for _ in rows]
    if name == 'buy-and-hold':
        return [0.99 for _ in rows]
    if name == 'technical-rule':
        return [
            _sigmoid((float(row.features.get('rsi14', 50.0)) - 50.0) / 8.0) for row in rows
        ]
    raise ValueError(f'unknown baseline {name!r}')


def _evaluate_baselines(
    splits: Any, feature_names: Sequence[str]
) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    for name in ('always-negative', 'buy-and-hold', 'technical-rule'):
        evaluations = [
            evaluate_predictions(
                labels(fold.test), _baseline_probabilities(name, fold.test)
            )
            for fold in splits.folds
        ]
        averaged: dict[str, float | int] = {'folds': len(evaluations)}
        for key in NUMERIC_METRICS:
            averaged[key] = round(
                sum(float(item[key]) for item in evaluations) / len(evaluations), 6
            )
        results[name] = averaged
    return results


def _render_report(rows: Sequence[Mapping[str, Any]], summary: Mapping[str, Any]) -> str:
    lines = [
        '# Model comparison report',
        '',
        'Generated by `python -m app.ml.train`. Walk-forward folds are chronological;',
        'calibration is fitted on the designated validation period only. Sorted by',
        'Brier (lower is better), then ROC-AUC (higher is better).',
        '',
        '| Model | Brier | ROC-AUC | Accuracy | F1 |',
        '|---|---:|---:|---:|---:|',
    ]
    for row in rows:
        lines.append(
            f"| {row['name']} | {float(row['brier']):.6f} | {float(row['rocAuc']):.6f} "
            f"| {float(row['accuracy']):.6f} | {float(row['f1']):.6f} |"
        )
    lines.extend(
        [
            '',
            f"- Dataset: `{summary['datasetVersion']}`",
            f"- Feature version: `{summary['featureVersion']}`",
            f"- Selected: **{summary['selectedModel']} {summary['selectedVersion']}**",
            f"- Calibration: `{summary['calibrationMethod']}`",
            f"- Selection reason: {summary['selectionReason']}",
            '',
        ]
    )
    return '\n'.join(lines)


async def run_training(config: TrainingConfig, dataset: Dataset | None = None) -> dict[str, Any]:
    """Execute the complete pipeline and return an auditable summary."""
    if dataset is None:
        if config.dataset_path:
            from .dataset import load_dataset_from_file

            dataset = load_dataset_from_file(config.dataset_path)
        else:
            features, candles = await load_market_rows(
                config.database_url,
                feature_version=config.feature_version,
                symbols=config.symbols,
                timeframes=config.timeframes,
                start=config.train_start,
                end=config.end,
            )
            dataset = build_dataset(
                features,
                candles,
                horizon=config.horizon,
                threshold_pct=config.threshold_pct,
                feature_names=FEATURE_NAMES,
            )

    splits = chronological_splits(
        dataset.examples,
        train_start=config.train_start,
        validation_start=config.validation_start,
        test_start=config.test_start,
        end=config.end,
        walk_forward=config.walk_forward,
    )
    feature_names = list(dataset.feature_names)
    model_names = (LR_NAME, RF_NAME, XGB_NAME)
    fold_evaluations: dict[str, list[_FoldEvaluation]] = {name: [] for name in model_names}
    run_specs: list[dict[str, Any]] = []

    for fold in splits.folds:
        fit_rows, validation_rows = _inner_split(fold.train)
        if not validation_rows:
            fit_rows, validation_rows = list(fold.train), []
        for name in model_names:
            _, calibrator, metrics = _train_one(
                name,
                fit_rows,
                validation_rows,
                fold.test,
                feature_names,
                config.seed,
                config.calibration_method,
            )
            evaluation = _FoldEvaluation(
                fold=fold.name,
                train_range=fold.train_range,
                test_range=fold.test_range,
                metrics=metrics,
                calibration_method=calibrator.method,
            )
            fold_evaluations[name].append(evaluation)
            run_specs.append(
                {
                    'model': name,
                    'startedAt': datetime.now(timezone.utc),
                    'finishedAt': datetime.now(timezone.utc),
                    'trainRange': fold.train_range,
                    'testRange': fold.test_range,
                    'seed': config.seed,
                    'metrics': metrics,
                    'fold': fold.name,
                }
            )

    baselines = _evaluate_baselines(splits, feature_names)
    walk_forward: dict[str, dict[str, Any]] = {}
    fitted: dict[str, tuple[ModelFit, Calibrator, dict[str, Any]]] = {}
    artifacts: dict[str, str] = {}
    checksums: dict[str, str] = {}

    # Final artifacts: fit on TRAIN, calibrate on the designated VAL period,
    # evaluate on TEST. No test row is ever seen by any calibrator.
    for name in model_names:
        fit, calibrator, holdout = _train_one(
            name,
            splits.train,
            splits.validation,
            splits.test,
            feature_names,
            config.seed,
            config.calibration_method,
        )
        fitted[name] = (fit, calibrator, holdout)
        aggregate = _mean_metrics(fold_evaluations[name])
        walk_forward[name] = {
            **aggregate,
            'holdout': {
                key: value
                for key, value in holdout.items()
                if key in NUMERIC_METRICS or key == 'samples'
            },
        }

    candidates = comparison_rows(
        {
            name: {
                'brier': values['brier'],
                'rocAuc': values['rocAuc'],
                'accuracy': values['accuracy'],
                'f1': values['f1'],
            }
            for name, values in walk_forward.items()
        }
    )
    xgb_metrics = walk_forward[XGB_NAME]
    competitors = {
        **{name: walk_forward[name] for name in (LR_NAME, RF_NAME)},
        **baselines,
    }
    xgb_wins = all(
        float(xgb_metrics['brier']) < float(values['brier'])
        and float(xgb_metrics['rocAuc']) > float(values['rocAuc'])
        for values in competitors.values()
    )
    if xgb_wins:
        selected = XGB_NAME
        selection_reason = (
            'xgbeat: XGBoost beat logistic regression, random forest and every '
            'simple baseline on walk-forward Brier (lower) and ROC-AUC (higher)'
        )
    else:
        eligible = [row for row in candidates if row['name'] != XGB_NAME]
        selected = str(eligible[0]['name'])
        failed = [
            name
            for name, values in competitors.items()
            if float(xgb_metrics['brier']) >= float(values['brier'])
            or float(xgb_metrics['rocAuc']) <= float(values['rocAuc'])
        ]
        selection_reason = (
            'xgboost-gate: XGBoost failed to beat '
            + ', '.join(sorted(failed))
            + ' on both walk-forward Brier and ROC-AUC; '
            + selected
            + ' was promoted as the best measured alternative'
        )

    version_specs: list[dict[str, Any]] = []
    versions_by_name: dict[str, str] = {}
    for name in model_names:
        fit, calibrator, holdout = fitted[name]
        algorithm_version = fit.version
        receipt = save_artifact(
            config.registry_path,
            name=name,
            version=algorithm_version,
            estimator=fit.estimator,
            feature_names=feature_names,
            seed=config.seed,
            feature_version=config.feature_version,
            dataset_version=dataset.version,
            hyperparams=fit.hyperparams,
            metrics={**walk_forward[name], 'holdout': holdout},
            calibration=calibrator.to_dict(),
            calibrator=calibrator.predictor,
        )
        artifacts[name] = receipt.path
        checksums[name] = receipt.checksum
        versions_by_name[name] = algorithm_version
        status = 'ACTIVE' if name == selected else 'ARCHIVED'
        version_specs.append(
            {
                'name': name,
                'version': algorithm_version,
                'featureVersion': config.feature_version,
                'trainingDatasetVersion': dataset.version,
                'hyperparams': fit.hyperparams,
                'metrics': {
                    **walk_forward[name],
                    'holdout': holdout,
                    'baselines': baselines,
                    'selection': {
                        'selected': selected,
                        'reason': selection_reason,
                        'xgboostGatePassed': xgb_wins,
                    },
                },
                'status': status,
            }
        )

    for spec in run_specs:
        name = str(spec.pop('model'))
        spec['modelKey'] = f'{name}:{versions_by_name[name]}'
        spec['artifactsPath'] = artifacts[name]

    if config.write_registry:
        await write_registry_rows(config.database_url, versions=version_specs, runs=run_specs)

    report_rows = comparison_rows(
        {
            **{
                name: {
                    'brier': values['brier'],
                    'rocAuc': values['rocAuc'],
                    'accuracy': values['accuracy'],
                    'f1': values['f1'],
                }
                for name, values in walk_forward.items()
            },
            **{
                name: {
                    'brier': values['brier'],
                    'rocAuc': values['rocAuc'],
                    'accuracy': values['accuracy'],
                    'f1': values['f1'],
                }
                for name, values in baselines.items()
            },
        }
    )
    summary: dict[str, Any] = {
        'datasetVersion': dataset.version,
        'datasetChecksum': dataset.checksum,
        'datasetRows': dataset.size,
        'featureVersion': config.feature_version,
        'horizonMinutes': parse_horizon(config.horizon),
        'thresholdPct': config.threshold_pct,
        'seed': config.seed,
        'calibrationMethod': config.calibration_method,
        'walkForward': walk_forward,
        'baselines': baselines,
        'comparison': report_rows,
        'selectedModel': selected,
        'selectedVersion': versions_by_name[selected],
        'selectionReason': selection_reason,
        'xgboostGatePassed': xgb_wins,
        'models': {name: {'artifactPath': artifacts[name], 'sha256': checksums[name]} for name in model_names},
        'modelRuns': len(run_specs),
    }

    registry_root = Path(config.registry_path).resolve()
    reports_dir = registry_root / 'reports' / dataset.version
    reports_dir.mkdir(parents=True, exist_ok=True)
    (reports_dir / 'comparison.json').write_text(
        json.dumps(summary, indent=2, sort_keys=True) + '\n', encoding='utf-8'
    )
    (reports_dir / 'dataset.json').write_text(
        json.dumps(
            {
                'version': dataset.version,
                'checksum': dataset.checksum,
                'rows': dataset.size,
                'featureNames': feature_names,
                'horizonMinutes': dataset.horizon_minutes,
                'thresholdPct': dataset.threshold_pct,
            },
            indent=2,
            sort_keys=True,
        )
        + '\n',
        encoding='utf-8',
    )
    if config.write_report:
        report_path = Path(config.report_path)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(_render_report(report_rows, summary), encoding='utf-8')
    return summary


def train_sync(config: TrainingConfig, dataset: Dataset | None = None) -> dict[str, Any]:
    """Synchronous bridge for the FastAPI worker thread and CLI."""
    return asyncio.run(run_training(config, dataset))


if __name__ == '__main__':  # python -m app.ml.train
    from .cli import main

    raise SystemExit(main())
