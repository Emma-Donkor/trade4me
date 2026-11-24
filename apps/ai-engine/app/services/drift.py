"""Phase 14 model-drift detection over resolved outcomes only.

Recent accuracy/Brier is compared with the older historical window.  The
comparison is pure so the 68% -> 51% degradation fixture and noise cases are
testable without a database; `evaluate_drift` is the read-only DB adapter.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, Sequence

from ..config import settings
from ..deps.db import asyncpg_dsn

DRIFT_WARNING = 'DRIFT_WARNING'
HEALTHY = 'HEALTHY'


@dataclass(frozen=True)
class DriftConfig:
    minSamples: int = 20
    recentWindow: int = 50
    accuracyDrop: float = 0.10
    brierIncrease: float = 0.05

    def __post_init__(self) -> None:
        if self.minSamples < 4 or self.recentWindow < 4:
            raise ValueError('drift windows must contain at least four samples')
        if self.accuracyDrop <= 0 or self.brierIncrease <= 0:
            raise ValueError('drift thresholds must be positive')


@dataclass(frozen=True)
class OutcomePoint:
    probability: float
    label: int
    createdAt: datetime | str


@dataclass(frozen=True)
class DriftReport:
    modelVersion: str
    status: Literal['HEALTHY', 'DRIFT_WARNING']
    historicalAccuracy: float
    recentAccuracy: float
    historicalBrier: float
    recentBrier: float
    samples: int
    reason: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            'modelVersion': self.modelVersion,
            'status': self.status,
            'historicalAccuracy': self.historicalAccuracy,
            'recentAccuracy': self.recentAccuracy,
            'historicalBrier': self.historicalBrier,
            'recentBrier': self.recentBrier,
            'samples': self.samples,
            'reason': self.reason,
        }


def _scores(points: Sequence[OutcomePoint]) -> tuple[float, float]:
    labels = [int(point.label) for point in points]
    probabilities = [min(1.0, max(0.0, float(point.probability))) for point in points]
    accuracy = sum(
        1 for probability, label in zip(probabilities, labels)
        if int(probability >= 0.5) == label
    ) / len(points)
    brier = sum(
        (probability - label) ** 2 for probability, label in zip(probabilities, labels)
    ) / len(points)
    return accuracy, brier


def detect_drift(
    points: Sequence[OutcomePoint],
    *,
    config: DriftConfig = DriftConfig(),
    modelVersion: str = '',
) -> DriftReport:
    """Compare the newest window with everything before it."""
    ordered = sorted(points, key=lambda point: str(point.createdAt))
    total = len(ordered)
    if total < config.minSamples:
        return DriftReport(
            modelVersion=modelVersion,
            status=HEALTHY,
            historicalAccuracy=0.0,
            recentAccuracy=0.0,
            historicalBrier=0.0,
            recentBrier=0.0,
            samples=total,
            reason='insufficient resolved outcomes',
        )

    split = max(0, total - config.recentWindow)
    historical = ordered[:split]
    recent = ordered[split:]
    if len(recent) < max(4, config.minSamples // 2) or len(historical) < 4:
        return DriftReport(
            modelVersion=modelVersion,
            status=HEALTHY,
            historicalAccuracy=0.0,
            recentAccuracy=0.0,
            historicalBrier=0.0,
            recentBrier=0.0,
            samples=total,
            reason='insufficient samples in the rolling windows',
        )

    historical_accuracy, historical_brier = _scores(historical)
    recent_accuracy, recent_brier = _scores(recent)
    accuracy_drop = historical_accuracy - recent_accuracy
    brier_rise = recent_brier - historical_brier
    if accuracy_drop >= config.accuracyDrop:
        reason = (
            f'accuracy degraded by {accuracy_drop:.2f} '
            f'({historical_accuracy:.2f} -> {recent_accuracy:.2f})'
        )
    elif brier_rise >= config.brierIncrease:
        reason = (
            f'Brier score degraded by {brier_rise:.2f} '
            f'({historical_brier:.2f} -> {recent_brier:.2f})'
        )
    else:
        reason = None
    return DriftReport(
        modelVersion=modelVersion,
        status=DRIFT_WARNING if reason is not None else HEALTHY,
        historicalAccuracy=round(historical_accuracy, 6),
        recentAccuracy=round(recent_accuracy, 6),
        historicalBrier=round(historical_brier, 6),
        recentBrier=round(recent_brier, 6),
        samples=total,
        reason=reason,
    )


async def evaluate_drift(
    database_url: str | None = None,
    *,
    config: DriftConfig = DriftConfig(),
    limit: int = 500,
) -> DriftReport:
    """Read resolved ACTIVE-model outcomes in a read-only transaction."""
    import asyncpg

    connection = await asyncpg.connect(asyncpg_dsn(database_url or settings.DATABASE_URL))
    try:
        async with connection.transaction():
            await connection.execute('SET TRANSACTION READ ONLY')
            rows = await connection.fetch(
                '''
                SELECT mv."name", mv."version", p."probability"::float8 AS "probability",
                       o."label", p."createdAt"
                FROM "PredictionOutcome" o
                JOIN "Prediction" p ON p."id" = o."predictionId"
                JOIN "ModelVersion" mv ON mv."id" = p."modelVersionId"
                WHERE mv."status"::text = 'ACTIVE'
                ORDER BY p."createdAt" DESC, p."id" DESC
                LIMIT $1
                ''',
                int(limit),
            )
    finally:
        await connection.close()

    points = [
        OutcomePoint(
            probability=float(row['probability']),
            label=int(row['label']),
            createdAt=row['createdAt'],
        )
        for row in reversed(rows)
    ]
    model_version = f"{rows[0]['name']}-{rows[0]['version']}" if rows else ''
    return detect_drift(points, config=config, modelVersion=model_version)
