"""PHASE 13 evaluation: threshold metrics, ROC-AUC, Brier and reliability."""

from __future__ import annotations

import math
from typing import Any, Sequence

_EPSILON = 1e-12


def _clip(values: Sequence[float]) -> list[float]:
    return [min(1.0, max(0.0, float(value))) for value in values]


def evaluate_predictions(
    y_true: Sequence[int], y_probability: Sequence[float], threshold: float = 0.5
) -> dict[str, float | int]:
    """Compute every metric required by README §13.6 and the roadmap."""
    actual = [int(value) for value in y_true]
    predicted = _clip(y_probability)
    if not actual or len(actual) != len(predicted):
        raise ValueError('labels and probabilities must be non-empty and equal length')

    decisions = [int(value >= threshold) for value in predicted]
    true_positive = sum(1 for y, y_hat in zip(actual, decisions, strict=False) if y == 1 and y_hat == 1)
    false_positive = sum(1 for y, y_hat in zip(actual, decisions, strict=False) if y == 0 and y_hat == 1)
    false_negative = sum(1 for y, y_hat in zip(actual, decisions, strict=False) if y == 1 and y_hat == 0)
    true_negative = sum(1 for y, y_hat in zip(actual, decisions, strict=False) if y == 0 and y_hat == 0)

    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
    recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    accuracy = (true_positive + true_negative) / len(actual)
    brier = sum((y - p) ** 2 for y, p in zip(actual, predicted, strict=False)) / len(actual)
    log_loss = -sum(
        math.log(p if y == 1 else 1 - p) for y, p in zip(actual, [max(_EPSILON, min(1 - _EPSILON, v)) for v in predicted], strict=False)
    ) / len(actual)

    return {
        'samples': len(actual),
        'accuracy': round(accuracy, 6),
        'precision': round(precision, 6),
        'recall': round(recall, 6),
        'f1': round(f1, 6),
        'rocAuc': round(roc_auc(actual, predicted), 6),
        'brier': round(brier, 6),
        'logLoss': round(log_loss, 6),
        'positiveRate': round(sum(actual) / len(actual), 6),
        'confusion': {
            'truePositive': true_positive,
            'falsePositive': false_positive,
            'trueNegative': true_negative,
            'falseNegative': false_negative,
        },
    }


def roc_auc(y_true: Sequence[int], y_score: Sequence[float]) -> float:
    """Rank-based ROC-AUC (Mann-Whitney) with tie averaging; no sklearn needed."""
    actual = [int(value) for value in y_true]
    scores = [float(value) for value in y_score]
    positives = [score for label, score in zip(actual, scores) if label == 1]
    negatives = [score for label, score in zip(actual, scores) if label == 0]
    if not positives or not negatives:
        return 0.5
    ordered = sorted(range(len(scores)), key=lambda index: scores[index])
    ranks = [0.0] * len(scores)
    index = 0
    while index < len(ordered):
        end = index
        while end + 1 < len(ordered) and scores[ordered[end + 1]] == scores[ordered[index]]:
            end += 1
        average_rank = (index + end) / 2 + 1
        for position in range(index, end + 1):
            ranks[ordered[position]] = average_rank
        index = end + 1
    positive_rank_sum = sum(rank for label, rank in zip(actual, ranks) if label == 1)
    return (positive_rank_sum - len(positives) * (len(positives) + 1) / 2) / (
        len(positives) * len(negatives)
    )


def reliability_table(
    y_true: Sequence[int], y_probability: Sequence[float], buckets: int = 10
) -> list[dict[str, float | int]]:
    """Ten equal-width predicted-probability buckets with observed frequency."""
    if buckets <= 0:
        raise ValueError('buckets must be positive')
    grouped: list[list[int]] = [[] for _ in range(buckets)]
    for label, probability in zip(y_true, _clip(y_probability)):
        index = min(buckets - 1, int(probability * buckets))
        grouped[index].append(int(label))
    table: list[dict[str, float | int]] = []
    for index, labels in enumerate(grouped):
        lower = index / buckets
        upper = (index + 1) / buckets
        predicted = (lower + upper) / 2
        observed = sum(labels) / len(labels) if labels else 0.0
        table.append(
            {
                'bucket': index,
                'lower': round(lower, 4),
                'upper': round(upper, 4),
                'count': len(labels),
                'predicted': round(predicted, 4),
                'observed': round(observed, 4),
                'gap': round(observed - predicted, 4),
            }
        )
    return table


def calibration_gap(table: Sequence[dict[str, float | int]], *, min_count: int = 5) -> float:
    """Maximum absolute gap over buckets with enough samples."""
    usable = [abs(float(row['gap'])) for row in table if int(row['count']) >= min_count]
    return max(usable, default=0.0)


def comparison_rows(results: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Sort by Brier (lower better), then ROC-AUC (higher better)."""
    return sorted(
        (
            {
                'name': name,
                'brier': metrics['brier'],
                'rocAuc': metrics['rocAuc'],
                'accuracy': metrics['accuracy'],
                'f1': metrics['f1'],
            }
            for name, metrics in results.items()
        ),
        key=lambda row: (float(row['brier']), -float(row['rocAuc'])),
    )
