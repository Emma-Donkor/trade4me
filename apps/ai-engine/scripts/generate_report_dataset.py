"""Build the deterministic dataset snapshot used for docs/ml-comparison.md.

Usage (from the repo root):

    PYTHONPATH=apps/ai-engine ./apps/ai-engine/.venv/Scripts/python.exe \
      apps/ai-engine/scripts/generate_report_dataset.py /tmp/p13-dataset.json

The snapshot is fully deterministic: a fixed-seed PRNG chooses daily move
directions, rsi14 carries a deliberately imperfect (~80%) signal, and all other
features come from the committed P12 manifest.  It is fed back through the real
CLI with ``--dataset`` so the committed report is byte-identical everywhere.
"""

from __future__ import annotations

import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.ml.dataset import CandlePoint, FeatureRow, build_dataset, dataset_to_records
from app.services.feature_manifest import FEATURE_NAMES

SEED = 20260101
ROWS = 400


def _directions() -> list[bool]:
    rng = random.Random(SEED)
    return [rng.random() > 0.5 for _ in range(ROWS)]


def _features(index: int, direction: bool, rng: random.Random) -> dict[str, float]:
    values: dict[str, float] = {}
    for position, name in enumerate(FEATURE_NAMES):
        if name.startswith('regime_') or name.endswith('_missing'):
            values[name] = float((index + position) % 2)
        elif name == 'rsi14':
            # ~80% correlated with the NEXT bar's direction, never perfect.
            signal = direction if rng.random() < 0.8 else not direction
            values[name] = 70.0 if signal else 30.0
        else:
            values[name] = round((index % 97) / 97.0 + position / 1000.0, 6)
    return values


def main() -> int:
    if len(sys.argv) != 2:
        print('usage: generate_report_dataset.py <output.json>', file=sys.stderr)
        return 2
    start = datetime(2025, 1, 1, tzinfo=timezone.utc)
    directions = _directions()
    signal_rng = random.Random(SEED + 1)
    feature_rows: list[FeatureRow] = []
    candles: list[CandlePoint] = []
    closes = [1.1000]
    for index in range(ROWS):
        timestamp = start + timedelta(days=index)
        if index:
            closes.append(round(closes[-1] * (1.005 if directions[index] else 0.995), 8))
        # The label at index depends on the move to index+1; use the last
        # direction for the final row, which is dropped as an incomplete window.
        next_direction = directions[min(index + 1, ROWS - 1)]
        feature_rows.append(
            FeatureRow(
                'EUR/USD',
                'D1',
                timestamp,
                'v1.0',
                _features(index, next_direction, signal_rng),
            )
        )
        candles.append(CandlePoint('EUR/USD', 'D1', timestamp, closes[index]))
    dataset = build_dataset(
        feature_rows,
        candles,
        horizon='24h',
        threshold_pct=0.30,
        feature_names=FEATURE_NAMES,
    )
    Path(sys.argv[1]).write_text(
        json.dumps(dataset_to_records(dataset), indent=2, sort_keys=True) + '\n',
        encoding='utf-8',
    )
    print(f'{dataset.size} rows -> {sys.argv[1]}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
