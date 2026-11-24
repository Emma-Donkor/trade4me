"""PHASE 13 no-shuffle gate: every fold is strictly monotonic in time."""

from __future__ import annotations

import pytest

from app.ml.split import chronological_splits, labels, matrix
from ml_fixtures import labeled_examples, utc


def test_chronological_splits_never_interleave_train_and_test() -> None:
    examples = labeled_examples(start=utc(2020, 1, 1), days=400)
    splits = chronological_splits(
        examples,
        train_start='2020-01-01T00:00:00Z',
        validation_start='2021-01-01T00:00:00Z',
        test_start='2021-02-01T00:00:00Z',
        end='2021-03-01T00:00:00Z',
    )
    assert len(splits.folds) == 3
    assert [fold.name for fold in splits.folds] == ['fold-2023', 'fold-2024', 'fold-2025']
    for fold in splits.folds:
        assert max(row.timestamp for row in fold.train) < min(
            row.timestamp for row in fold.test
        )
        assert [row.timestamp for row in fold.train] == sorted(
            row.timestamp for row in fold.train
        )
        assert [row.timestamp for row in fold.test] == sorted(
            row.timestamp for row in fold.test
        )


def test_default_years_match_readme_13_3_and_13_4() -> None:
    examples = labeled_examples(start=utc(2020, 1, 1), days=2190)
    splits = chronological_splits(examples)
    assert max(row.timestamp for row in splits.train).year <= 2023
    assert {row.timestamp.year for row in splits.validation} == {2024}
    assert {row.timestamp.year for row in splits.test} == {2025}
    assert splits.folds[0].test_range['from'].startswith('2023')
    assert splits.folds[1].test_range['from'].startswith('2024')
    assert splits.folds[2].test_range['from'].startswith('2025')


def test_overlapping_boundaries_are_rejected() -> None:
    with pytest.raises(ValueError, match='train_start'):
        chronological_splits(
            labeled_examples(days=100),
            train_start='2024-06-01T00:00:00Z',
            validation_start='2024-01-01T00:00:00Z',
            test_start='2025-01-01T00:00:00Z',
        )


def test_matrix_and_labels_preserve_row_order() -> None:
    examples = labeled_examples(days=5)
    assert labels(examples) == [item.label for item in examples]
    assert len(matrix(examples, list(examples[0].features))) == 5
