"""Dataset builder: versioned feature rows + strictly future labels.

A feature at ``t`` is paired only with candles in ``(t, t + horizon]``.  The
reference price is the candle close *at* ``t`` (known when the feature was
built).  No future information enters ``features``; the label is the only
forward-looking value and is computed from closes after ``t``.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Iterable, Mapping, Sequence

from ..deps.db import asyncpg_dsn

_HORIZON_PATTERN = re.compile(r'^(\d+)(h|d)$', re.IGNORECASE)


def parse_timestamp(value: datetime | str) -> datetime:
    """Return an aware UTC datetime from a datetime or ISO-8601 string."""
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def format_timestamp(value: datetime) -> str:
    return parse_timestamp(value).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def parse_horizon(value: str | int) -> int:
    """Accept ``1h``/``4h``/``24h``/``3d``/``7d`` or a bare minute count."""
    if isinstance(value, int):
        if value <= 0:
            raise ValueError('horizon minutes must be positive')
        return value
    match = _HORIZON_PATTERN.match(value.strip())
    if match is None:
        raise ValueError(f'invalid horizon {value!r}; use 1h, 4h, 24h, 3d or 7d')
    amount = int(match.group(1))
    if amount <= 0:
        raise ValueError('horizon must be positive')
    return amount * (1440 if match.group(2).lower() == 'd' else 60)


@dataclass(frozen=True)
class FeatureRow:
    """A persisted, versioned P12 vector."""

    symbol: str
    timeframe: str
    timestamp: datetime
    feature_version: str
    values: dict[str, float]


@dataclass(frozen=True)
class CandlePoint:
    """The only forward data used for labelling is the close."""

    symbol: str
    timeframe: str
    timestamp: datetime
    close: float


@dataclass(frozen=True)
class LabeledExample:
    """One labelled observation: ``features`` at t, ``label`` over (t, t+h]."""

    symbol: str
    timeframe: str
    timestamp: datetime
    features: dict[str, float]
    label: int
    actual_move_pct: float
    horizon_minutes: int
    threshold_pct: float


@dataclass(frozen=True)
class Dataset:
    """Immutable dataset with a content-derived version for the registry."""

    version: str
    examples: tuple[LabeledExample, ...]
    feature_names: tuple[str, ...]
    horizon_minutes: int
    threshold_pct: float
    checksum: str

    @property
    def size(self) -> int:
        return len(self.examples)

    @property
    def positive_rate(self) -> float:
        if self.size == 0:
            return 0.0
        return sum(example.label for example in self.examples) / self.size


def _canonical(examples: Sequence[LabeledExample], feature_names: Sequence[str]) -> str:
    payload = {
        'featureNames': list(feature_names),
        'rows': [
            {
                'symbol': item.symbol,
                'timeframe': item.timeframe,
                'timestamp': format_timestamp(item.timestamp),
                'features': [item.features.get(name, 0.0) for name in feature_names],
                'label': item.label,
                'horizonMinutes': item.horizon_minutes,
                'thresholdPct': item.threshold_pct,
                'actualMovePct': round(item.actual_move_pct, 6),
            }
            for item in examples
        ],
    }
    return json.dumps(payload, sort_keys=True, separators=(',', ':'))


def build_dataset(
    feature_rows: Iterable[FeatureRow],
    candles: Iterable[CandlePoint],
    *,
    horizon: str | int = '24h',
    threshold_pct: float = 0.30,
    feature_names: Sequence[str] | None = None,
    version: str | None = None,
) -> Dataset:
    """Pair each feature row with its forward window; never shuffle inputs."""
    horizon_minutes = parse_horizon(horizon)
    if threshold_pct <= 0:
        raise ValueError('threshold_pct must be positive')

    rows = sorted(feature_rows, key=lambda row: (row.timestamp, row.symbol, row.timeframe))
    by_pair: dict[tuple[str, str], list[CandlePoint]] = {}
    for candle in candles:
        by_pair.setdefault((candle.symbol, candle.timeframe), []).append(candle)
    for series in by_pair.values():
        series.sort(key=lambda point: point.timestamp)

    resolved_names = (
        tuple(feature_names)
        if feature_names is not None
        else tuple(sorted({name for row in rows for name in row.values}))
    )
    if not resolved_names:
        raise ValueError('dataset has no feature columns')

    examples: list[LabeledExample] = []
    window = timedelta(minutes=horizon_minutes)
    for row in rows:
        series = by_pair.get((row.symbol, row.timeframe), [])
        reference_index = next(
            (index for index, point in enumerate(series) if point.timestamp == row.timestamp),
            None,
        )
        if reference_index is None:
            continue
        reference_close = series[reference_index].close
        if reference_close <= 0:
            continue
        future = [
            point
            for point in series[reference_index + 1 :]
            if row.timestamp < point.timestamp <= row.timestamp + window
        ]
        if not future:
            # Label period is incomplete; dropping avoids partial-window bias.
            continue
        move = max((point.close - reference_close) / reference_close * 100 for point in future)
        examples.append(
            LabeledExample(
                symbol=row.symbol,
                timeframe=row.timeframe,
                timestamp=row.timestamp,
                features={name: float(row.values[name]) for name in resolved_names},
                label=int(move >= threshold_pct),
                actual_move_pct=float(move),
                horizon_minutes=horizon_minutes,
                threshold_pct=float(threshold_pct),
            )
        )

    checksum = hashlib.sha256(_canonical(examples, resolved_names).encode('utf-8')).hexdigest()
    if version is None:
        if examples:
            start = min(item.timestamp for item in examples)
            end = max(item.timestamp for item in examples)
            version = f'{start:%Y%m%d}-{end:%Y%m%d}-{checksum[:8]}'
        else:
            version = f'empty-{checksum[:8]}'
    return Dataset(
        version=version,
        examples=tuple(examples),
        feature_names=resolved_names,
        horizon_minutes=horizon_minutes,
        threshold_pct=float(threshold_pct),
        checksum=checksum,
    )


def dataset_to_records(dataset: Dataset) -> dict[str, Any]:
    """Serialize a dataset for CLI replay and audit artifacts."""
    return {
        'version': dataset.version,
        'featureNames': list(dataset.feature_names),
        'horizonMinutes': dataset.horizon_minutes,
        'thresholdPct': dataset.threshold_pct,
        'checksum': dataset.checksum,
        'rows': [
            {
                'symbol': item.symbol,
                'timeframe': item.timeframe,
                'timestamp': format_timestamp(item.timestamp),
                'features': dict(item.features),
                'label': item.label,
                'actualMovePct': item.actual_move_pct,
            }
            for item in dataset.examples
        ],
    }


def dataset_from_records(payload: Mapping[str, Any]) -> Dataset:
    """Rebuild a dataset from a trusted, checksum-verifiable JSON snapshot."""
    examples = tuple(
        LabeledExample(
            symbol=str(row['symbol']),
            timeframe=str(row['timeframe']),
            timestamp=parse_timestamp(row['timestamp']),
            features={name: float(value) for name, value in row['features'].items()},
            label=int(row['label']),
            actual_move_pct=float(row['actualMovePct']),
            horizon_minutes=int(payload['horizonMinutes']),
            threshold_pct=float(payload['thresholdPct']),
        )
        for row in payload['rows']
    )
    restored = Dataset(
        version=str(payload['version']),
        examples=examples,
        feature_names=tuple(payload['featureNames']),
        horizon_minutes=int(payload['horizonMinutes']),
        threshold_pct=float(payload['thresholdPct']),
        checksum=str(payload['checksum']),
    )
    expected = hashlib.sha256(
        _canonical(examples, restored.feature_names).encode('utf-8')
    ).hexdigest()
    if expected != restored.checksum:
        raise ValueError('dataset snapshot checksum mismatch')
    return restored


async def load_market_rows(
    database_url: str,
    *,
    feature_version: str,
    symbols: Sequence[str] | None = None,
    timeframes: Sequence[str] | None = None,
    start: datetime | str | None = None,
    end: datetime | str | None = None,
) -> tuple[list[FeatureRow], list[CandlePoint]]:
    """Read-only loader over production tables; no writes, no mutations."""
    import asyncpg

    symbol_list = list(symbols) if symbols else None
    timeframe_list = list(timeframes) if timeframes else None
    # Prisma timestamps are timestamp(3) without time zone; asyncpg cannot bind
    # an aware datetime to them.
    start_dt = parse_timestamp(start).replace(tzinfo=None) if start is not None else None
    end_dt = parse_timestamp(end).replace(tzinfo=None) if end is not None else None

    async def _fetch(connection: asyncpg.Connection, table: str, is_feature: bool) -> list[Any]:
        # Parameter order must match the final placeholder order; inserting the
        # feature version later would silently shift every range predicate.
        params: list[Any] = [feature_version] if is_feature else []
        conditions = []
        if is_feature:
            conditions.append('c."featureVersion" = $1')
        conditions.append('p."isActive" = TRUE')
        if symbol_list is not None:
            params.append(symbol_list)
            conditions.append(f'p."symbol" = ANY(${len(params)}::text[])')
        if timeframe_list is not None:
            params.append(timeframe_list)
            conditions.append(f'c."timeframe" = ANY(${len(params)}::text[])')
        if start_dt is not None:
            params.append(start_dt)
            conditions.append(f'c."timestamp" >= ${len(params)}')
        if end_dt is not None:
            params.append(end_dt)
            conditions.append(f'c."timestamp" <= ${len(params)}')
        columns = (
            'p."symbol", c."timeframe", c."timestamp", c."values"'
            if is_feature
            else 'p."symbol", c."timeframe", c."timestamp", c."close"'
        )
        sql = (
            f'SELECT {columns} FROM "{table}" c '
            'JOIN "CurrencyPair" p ON p."id" = c."pairId" '
            f'WHERE {" AND ".join(conditions)} ORDER BY c."timestamp" ASC'
        )
        return await connection.fetch(sql, *params)

    connection = await asyncpg.connect(asyncpg_dsn(database_url))
    try:
        async with connection.transaction(isolation='read_committed'):
            await connection.execute('SET TRANSACTION READ ONLY')
            raw_features = await _fetch(connection, 'MarketFeature', True)
            raw_candles = await _fetch(connection, 'MarketCandle', False)
    finally:
        await connection.close()

    def as_float(value: Any) -> float:
        if isinstance(value, Decimal):
            return float(value)
        return float(value)

    def as_values(value: Any) -> dict[str, float]:
        parsed = json.loads(value) if isinstance(value, (str, bytes)) else value
        return {str(key): float(item) for key, item in dict(parsed).items()}

    features = [
        FeatureRow(
            symbol=str(row[0]),
            timeframe=str(row[1]),
            timestamp=parse_timestamp(row[2]),
            feature_version=feature_version,
            values=as_values(row[3]),
        )
        for row in raw_features
    ]
    candles = [
        CandlePoint(
            symbol=str(row[0]),
            timeframe=str(row[1]),
            timestamp=parse_timestamp(row[2]),
            close=as_float(row[3]),
        )
        for row in raw_candles
    ]
    return features, candles


def load_dataset_from_file(path: str) -> Dataset:
    with open(path, encoding='utf-8') as handle:
        return dataset_from_records(json.load(handle))
