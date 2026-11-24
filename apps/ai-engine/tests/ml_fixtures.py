"""Deterministic fixtures shared by the PHASE 13 ML tests."""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any

from app.ml.dataset import CandlePoint, FeatureRow, LabeledExample
from app.services.feature_manifest import FEATURE_NAMES


def utc(year: int, month: int, day: int, hour: int = 0) -> datetime:
    return datetime(year, month, day, hour, tzinfo=timezone.utc)


def feature_values(index: int) -> dict[str, float]:
    """Deterministic, manifest-shaped vector with useful signal for training."""
    values: dict[str, float] = {}
    for position, name in enumerate(FEATURE_NAMES):
        if name.startswith('regime_') or name.endswith('_missing') or name.startswith('dow_') or name.startswith('session_'):
            values[name] = float((index + position) % 2)
        elif name == 'rsi14':
            values[name] = 30.0 + (index * 7 % 50)
        else:
            values[name] = round(math.sin(index / 9.0 + position) + index / 1000.0, 6)
    return values


def labeled_examples(
    *, start: datetime | None = None, days: int = 120, seed: int = 7
) -> tuple[LabeledExample, ...]:
    """Chronological labelled rows; labels are deterministic, never shuffled."""
    first = start or utc(2024, 1, 1)
    rows: list[LabeledExample] = []
    for index in range(days):
        timestamp = first + timedelta(days=index)
        label = int(((index * 7 + seed) % 11) < 5)
        rows.append(
            LabeledExample(
                symbol='EUR/USD',
                timeframe='D1',
                timestamp=timestamp,
                features=feature_values(index),
                label=label,
                actual_move_pct=float((index % 9) * 0.11),
                horizon_minutes=1440,
                threshold_pct=0.30,
            )
        )
    return tuple(rows)


def simple_market_rows(
    *, count: int = 40, start: datetime | None = None
) -> tuple[list[FeatureRow], list[CandlePoint]]:
    """One bar/hour ascending series with a feature row at every bar."""
    first = start or utc(2026, 1, 1)
    features: list[FeatureRow] = []
    candles: list[CandlePoint] = []
    for index in range(count):
        timestamp = first + timedelta(hours=index)
        close = 1.10 + index * 0.005
        candles.append(CandlePoint('EUR/USD', 'H1', timestamp, close))
        features.append(
            FeatureRow('EUR/USD', 'H1', timestamp, 'v1.0', feature_values(index))
        )
    return features, candles


def training_payload(examples: tuple[LabeledExample, ...]) -> dict[str, Any]:
    """Dataset snapshot records for CLI replay tests."""
    return {
        'version': 'fixture-2024',
        'featureNames': list(FEATURE_NAMES),
        'horizonMinutes': 1440,
        'thresholdPct': 0.30,
        'checksum': 'placeholder',
        'rows': [
            {
                'symbol': item.symbol,
                'timeframe': item.timeframe,
                'timestamp': item.timestamp.isoformat().replace('+00:00', 'Z'),
                'features': item.features,
                'label': item.label,
                'actualMovePct': item.actual_move_pct,
            }
            for item in examples
        ],
    }
