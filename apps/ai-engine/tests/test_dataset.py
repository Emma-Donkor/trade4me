"""PHASE 13 dataset builder: strict (t, t+horizon] labelling and checksums."""

from __future__ import annotations

import asyncio
import sys
import types
from datetime import timedelta

import pytest

from app.ml.dataset import (
    CandlePoint,
    FeatureRow,
    build_dataset,
    dataset_from_records,
    dataset_to_records,
    load_market_rows,
    parse_horizon,
)
from app.services.feature_manifest import FEATURE_NAMES
from ml_fixtures import feature_values, simple_market_rows, utc


def test_horizon_parser_accepts_documented_values() -> None:
    assert parse_horizon('1h') == 60
    assert parse_horizon('4h') == 240
    assert parse_horizon('24h') == 1440
    assert parse_horizon('3d') == 4320
    assert parse_horizon('7d') == 10080


def test_label_uses_only_candles_after_the_feature_timestamp() -> None:
    features, candles = simple_market_rows(count=10)
    dataset = build_dataset(
        features,
        candles,
        horizon='1h',
        threshold_pct=0.30,
        feature_names=FEATURE_NAMES,
    )
    # 0.005 / 1.10 ≈ 0.4545% per bar, so every complete window is positive.
    assert dataset.size == 9
    assert all(item.label == 1 for item in dataset.examples)
    assert abs(dataset.examples[0].actual_move_pct - 0.454545) < 0.00001
    assert list(dataset.feature_names) == list(FEATURE_NAMES)


def test_partial_windows_are_dropped_and_t_plus_h_is_inclusive() -> None:
    first = utc(2026, 1, 1)
    rows = [
        CandlePoint('EUR/USD', 'H1', first + timedelta(hours=hour), 1.0 + hour * 0.01)
        for hour in range(5)
    ]
    feature = FeatureRow('EUR/USD', 'H1', first, 'v1.0', feature_values(0))
    dataset = build_dataset(
        [feature],
        rows,
        horizon='1h',
        threshold_pct=0.01,
        feature_names=FEATURE_NAMES,
    )
    assert dataset.size == 1
    assert dataset.examples[0].timestamp == first
    assert dataset.examples[0].label == 1

    # A feature at the penultimate bar has one future candle; at the last bar
    # there is none, so it is intentionally excluded.
    later = FeatureRow('EUR/USD', 'H1', first + timedelta(hours=4), 'v1.0', feature_values(4))
    assert build_dataset([later], rows, horizon='1h', feature_names=FEATURE_NAMES).size == 0


def test_dataset_snapshot_round_trip_preserves_checksum() -> None:
    features, candles = simple_market_rows(count=12)
    dataset = build_dataset(
        features, candles, horizon='1h', threshold_pct=0.30, feature_names=FEATURE_NAMES
    )
    restored = dataset_from_records(dataset_to_records(dataset))
    assert restored.checksum == dataset.checksum
    assert restored.version == dataset.version
    assert [item.label for item in restored.examples] == [
        item.label for item in dataset.examples
    ]


def test_market_loader_reads_the_real_prisma_table_read_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The Candle model is persisted as MarketCandle; a typo silently empties training."""
    statements: list[tuple[str, tuple[object, ...]]] = []

    class FakeTransaction:
        async def __aenter__(self) -> 'FakeTransaction':
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

    class FakeConnection:
        def transaction(self, **_: object) -> FakeTransaction:
            return FakeTransaction()

        async def execute(self, sql: str, *args: object) -> None:
            statements.append((sql, args))

        async def fetch(self, sql: str, *args: object) -> list[object]:
            statements.append((sql, args))
            return []

        async def close(self) -> None:
            return None

    async def connect(_: str) -> FakeConnection:
        return FakeConnection()

    fake = types.ModuleType('asyncpg')
    fake.connect = connect  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, 'asyncpg', fake)

    asyncio.run(
        load_market_rows(
            'postgresql://unused',
            feature_version='v1.0',
            symbols=['EUR/USD'],
            start='2020-01-01',
            end='2026-01-01',
        )
    )
    joined = '\n'.join(sql for sql, _ in statements)
    assert 'SET TRANSACTION READ ONLY' in joined
    assert 'FROM "MarketFeature" c' in joined
    assert 'FROM "MarketCandle" c' in joined
    # $1 is the feature version in both queries; range symbols are never
    # shifted into a text parameter, and datetimes are naive for Prisma.
    assert 'c."featureVersion" = $1' in joined
    assert 'c."timestamp" >= $3' in joined
    for sql, args in statements:
        if 'FROM "MarketFeature"' in sql:
            assert args[0] == 'v1.0'
        elif 'FROM "MarketCandle"' in sql:
            assert args[0] == ['EUR/USD']
        else:
            continue
        assert all(getattr(arg, 'tzinfo', None) is None for arg in args)
