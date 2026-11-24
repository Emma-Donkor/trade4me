"""Chronological splits and walk-forward folds — shuffling is impossible here.

Defaults implement README §13.3/§13.4: TRAIN through 2023, VALIDATION 2024,
TEST 2025, with folds (2020–2022→2023), (2020–2023→2024), (2020–2024→2025).
Explicit ISO dates override the calendar years for shorter fixtures.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone, UTC
from collections.abc import Sequence

from .dataset import LabeledExample, parse_timestamp

TRAIN_START_YEAR = 2020
VALIDATION_YEAR = 2024
TEST_YEAR = 2025


@dataclass(frozen=True)
class Split:
    """One strictly ordered train/test pair."""

    name: str
    train: tuple[LabeledExample, ...]
    test: tuple[LabeledExample, ...]
    train_range: dict[str, str]
    test_range: dict[str, str]


@dataclass(frozen=True)
class Splits:
    train: tuple[LabeledExample, ...]
    validation: tuple[LabeledExample, ...]
    test: tuple[LabeledExample, ...]
    folds: tuple[Split, ...]

    @property
    def all_rows(self) -> tuple[LabeledExample, ...]:
        return self.train + self.validation + self.test


def _range(rows: Sequence[LabeledExample]) -> dict[str, str]:
    if not rows:
        return {'from': '', 'to': ''}
    return {
        'from': min(row.timestamp for row in rows).isoformat().replace('+00:00', 'Z'),
        'to': max(row.timestamp for row in rows).isoformat().replace('+00:00', 'Z'),
    }


def _window(
    rows: Sequence[LabeledExample], start: datetime | None, end: datetime | None
) -> tuple[LabeledExample, ...]:
    selected = [
        row
        for row in rows
        if (start is None or row.timestamp >= start) and (end is None or row.timestamp < end)
    ]
    return tuple(selected)


def _new_split(name: str, train: Sequence[LabeledExample], test: Sequence[LabeledExample]) -> Split:
    if not train or not test:
        raise ValueError(f'{name} needs non-empty train and test rows')
    latest_train = max(row.timestamp for row in train)
    earliest_test = min(row.timestamp for row in test)
    if latest_train >= earliest_test:
        raise ValueError(f'{name} leaks future rows into training')
    return Split(
        name=name,
        train=tuple(train),
        test=tuple(test),
        train_range=_range(train),
        test_range=_range(test),
    )


def chronological_splits(
    examples: Sequence[LabeledExample],
    *,
    train_start: datetime | str | None = None,
    validation_start: datetime | str | None = None,
    test_start: datetime | str | None = None,
    end: datetime | str | None = None,
    walk_forward: bool = True,
) -> Splits:
    """Partition by time only; the returned folds are provably monotonic."""
    rows = tuple(sorted(examples, key=lambda item: item.timestamp))
    if not rows:
        raise ValueError('cannot split an empty dataset')

    start = parse_timestamp(train_start) if train_start is not None else datetime(
        TRAIN_START_YEAR, 1, 1, tzinfo=UTC
    )
    validation = parse_timestamp(validation_start) if validation_start is not None else datetime(
        VALIDATION_YEAR, 1, 1, tzinfo=UTC
    )
    test = parse_timestamp(test_start) if test_start is not None else datetime(
        TEST_YEAR, 1, 1, tzinfo=UTC
    )
    finish = parse_timestamp(end) if end is not None else datetime.max.replace(tzinfo=UTC)
    if not start < validation < test:
        raise ValueError('train_start < validation_start < test_start is required')

    train_rows = _window(rows, start, validation)
    validation_rows = _window(rows, validation, test)
    test_rows = _window(rows, test, finish)
    if not train_rows or not validation_rows or not test_rows:
        raise ValueError('train, validation and test partitions must all contain rows')

    if not walk_forward:
        return Splits(
            train=train_rows,
            validation=validation_rows,
            test=test_rows,
            folds=(_new_split('holdout', train_rows + validation_rows, test_rows),),
        )

    # First fold boundary is one calendar year before validation by default
    # (2024 → 2023). Explicit short ranges fall back to the median training
    # timestamp so every fold still receives a non-empty train and test slice.
    try:
        boundary = validation.replace(year=validation.year - 1)
    except ValueError:  # 29 February
        boundary = validation - timedelta(days=365)
    if not _window(rows, start, boundary) or not _window(rows, boundary, validation):
        training_timestamps = sorted(
            row.timestamp for row in rows if start <= row.timestamp < validation
        )
        if len(training_timestamps) < 2:
            raise ValueError('not enough rows for three chronological folds')
        boundary = training_timestamps[len(training_timestamps) // 2]

    fold_rows = (
        _new_split(
            'fold-2023',
            _window(rows, start, boundary),
            _window(rows, boundary, validation),
        ),
        _new_split('fold-2024', _window(rows, start, validation), validation_rows),
        _new_split('fold-2025', _window(rows, start, test), test_rows),
    )
    return Splits(train=train_rows, validation=validation_rows, test=test_rows, folds=fold_rows)


def matrix(rows: Sequence[LabeledExample], feature_names: Sequence[str]) -> list[list[float]]:
    return [[float(row.features[name]) for name in feature_names] for row in rows]


def labels(rows: Sequence[LabeledExample]) -> list[int]:
    return [int(row.label) for row in rows]
