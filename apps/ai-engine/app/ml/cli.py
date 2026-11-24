"""Deterministic training CLI: ``python -m app.ml.train --horizon 24h``."""

from __future__ import annotations

import argparse
import json
from typing import Sequence

from ..config import settings
from .train import TrainingConfig, train_sync


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Train and register PHASE 13 models')
    parser.add_argument('--horizon', default='24h', help='1h, 4h, 24h, 3d or 7d')
    parser.add_argument('--threshold', type=float, default=0.30, help='minimum upward move in percent')
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--feature-version', default=settings.FEATURE_VERSION)
    parser.add_argument('--database-url', default=settings.DATABASE_URL)
    parser.add_argument('--registry-path', default=settings.MODEL_REGISTRY_PATH)
    parser.add_argument('--symbols', default='', help='comma separated; empty means all active pairs')
    parser.add_argument('--timeframes', default='', help='comma separated; empty means all')
    parser.add_argument('--train-start', default=None, help='ISO date overriding the 2020 default')
    parser.add_argument('--validation-start', default=None, help='ISO date overriding 2024-01-01')
    parser.add_argument('--test-start', default=None, help='ISO date overriding 2025-01-01')
    parser.add_argument('--end', default=None, help='inclusive ISO end date')
    parser.add_argument(
        '--calibration-method', choices=('platt', 'isotonic'), default='platt'
    )
    parser.add_argument('--no-walk-forward', action='store_true')
    parser.add_argument('--dataset', default=None, help='trusted dataset JSON snapshot')
    parser.add_argument('--no-report', action='store_true')
    parser.add_argument('--report-path', default='docs/ml-comparison.md')
    parser.add_argument(
        '--no-registry',
        action='store_true',
        help='regenerate artifacts/report without writing ModelVersion/ModelRun rows',
    )
    return parser


def _csv(value: str) -> tuple[str, ...] | None:
    items = tuple(item.strip() for item in value.split(',') if item.strip())
    return items or None


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config = TrainingConfig(
        horizon=args.horizon,
        threshold_pct=args.threshold,
        seed=args.seed,
        feature_version=args.feature_version,
        database_url=args.database_url,
        registry_path=args.registry_path,
        symbols=_csv(args.symbols),
        timeframes=_csv(args.timeframes),
        train_start=args.train_start,
        validation_start=args.validation_start,
        test_start=args.test_start,
        end=args.end,
        calibration_method=args.calibration_method,
        walk_forward=not args.no_walk_forward and settings.WALK_FORWARD_ENABLED,
        dataset_path=args.dataset,
        write_report=not args.no_report,
        report_path=args.report_path,
        write_registry=not args.no_registry,
    )
    result = train_sync(config)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0
