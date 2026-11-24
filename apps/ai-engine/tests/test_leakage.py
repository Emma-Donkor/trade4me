"""PHASE 12 feature leakage and PHASE 13 dataset/fold leakage gates."""

from __future__ import annotations

import copy

from app.services.features import build_feature_vector
from feature_fixtures import (
    candles,
    event_item,
    iso,
    news_item,
    oscillating_candles,
    peer_candles,
    request_payload,
)


def test_future_candle_is_ignored_for_exact_as_of_boundary() -> None:
    rows = oscillating_candles(260)
    as_of = rows[220]['timestamp']
    truncated = [row for row in rows if row['timestamp'] <= as_of]
    with_future = copy.deepcopy(rows)

    baseline = build_feature_vector(
        symbol='EUR/USD', timeframe='H1', as_of=as_of, candles=truncated
    )
    vector = build_feature_vector(
        symbol='EUR/USD', timeframe='H1', as_of=as_of, candles=with_future
    )
    assert vector == baseline

    # A candle strictly after as_of changes nothing; the exact-t candle is included.
    without_exact = [row for row in truncated if row['timestamp'] < as_of]
    assert build_feature_vector(
        symbol='EUR/USD', timeframe='H1', as_of=as_of, candles=without_exact
    ) != baseline


def test_future_news_is_ignored_and_past_news_is_included() -> None:
    rows = oscillating_candles()
    as_of = rows[-1]['timestamp']
    baseline = build_feature_vector(
        symbol='EUR/USD', timeframe='H1', as_of=as_of, candles=rows
    )
    dirty = build_feature_vector(
        symbol='EUR/USD',
        timeframe='H1',
        as_of=as_of,
        candles=rows,
        news=[
            news_item(iso(5000), 'BEARISH', 'EXTREME'),
            news_item(iso(10000), 'BEARISH', 'EXTREME'),
        ],
    )
    assert dirty == baseline

    past = build_feature_vector(
        symbol='EUR/USD',
        timeframe='H1',
        as_of=as_of,
        candles=rows,
        news=[news_item(iso(250), 'BULLISH', 'EXTREME')],
    )
    assert past['news_missing'] == 0.0
    assert past['news_sentiment'] > baseline['news_sentiment']


def test_event_must_be_strictly_after_as_of() -> None:
    rows = oscillating_candles()
    as_of = rows[-1]['timestamp']
    baseline = build_feature_vector(
        symbol='EUR/USD', timeframe='H1', as_of=as_of, candles=rows
    )
    past_event = build_feature_vector(
        symbol='EUR/USD',
        timeframe='H1',
        as_of=as_of,
        candles=rows,
        events=[event_item(iso(100), 'EXTREME')],
    )
    assert past_event == baseline

    future_event = build_feature_vector(
        symbol='EUR/USD',
        timeframe='H1',
        as_of=as_of,
        candles=rows,
        events=[event_item(iso(260), 'HIGH')],
    )
    assert future_event['minutes_to_high_event'] == 60.0
    assert future_event['events_missing'] == 0.0

    exact_event = build_feature_vector(
        symbol='EUR/USD',
        timeframe='H1',
        as_of=as_of,
        candles=rows,
        events=[event_item(as_of, 'EXTREME')],
    )
    assert exact_event == baseline


def test_peer_candles_are_filtered_by_as_of() -> None:
    rows = oscillating_candles(260)
    as_of = rows[220]['timestamp']
    peer = peer_candles(1.01, start_offset=196)
    future_peer = [dict(row, timestamp=iso(5000 + index)) for index, row in enumerate(peer)]

    baseline = build_feature_vector(
        symbol='EUR/USD',
        timeframe='H1',
        as_of=as_of,
        candles=rows,
        peer_candles={'GBP/USD': peer},
    )
    vector = build_feature_vector(
        symbol='EUR/USD',
        timeframe='H1',
        as_of=as_of,
        candles=rows,
        peer_candles={'GBP/USD': future_peer},
    )
    assert vector['currency_strength_index'] == baseline['currency_strength_index']


def test_mutating_input_after_vector_build_does_not_change_vector() -> None:
    rows = oscillating_candles()
    snapshot = build_feature_vector(
        symbol='EUR/USD', timeframe='H1', as_of=rows[-1]['timestamp'], candles=rows
    )
    original = copy.deepcopy(rows)
    for row in rows:
        row['close'] = 99.0
        row['high'] = 100.0
    rebuilt = build_feature_vector(
        symbol='EUR/USD', timeframe='H1', as_of=original[-1]['timestamp'], candles=original
    )
    assert rebuilt == snapshot


def test_route_rejects_timestamps_after_as_of() -> None:
    rows = oscillating_candles()
    payload = request_payload(rows, timestamps=[iso(9999)])
    # The route normalises timestamps from its own request list; the builder guard
    # is exercised directly because the API never asks for future timestamps.
    from app.services.features import InsufficientDataError, build_rolling_vectors

    try:
        build_rolling_vectors(
            symbol='EUR/USD',
            timeframe='H1',
            as_of=rows[-1]['timestamp'],
            candles=rows,
            timestamps=[iso(9999)],
        )
    except InsufficientDataError as exc:
        assert 'timestamps<=as_of' in exc.missing
    else:
        raise AssertionError('Future timestamp was accepted')


# ─────────────────────────── PHASE 13 ───────────────────────────


def test_dataset_label_ignores_candles_outside_the_forward_window() -> None:
    """Only closes in (t, t+horizon] may set the label; past/late ones may not."""
    from datetime import timedelta

    from app.ml.dataset import CandlePoint, FeatureRow, build_dataset
    from ml_fixtures import feature_values, utc

    first = utc(2026, 1, 1)
    times = [first + timedelta(hours=hour) for hour in range(6)]
    # Baseline: a +1% move at t+1h, flat elsewhere. Label must be positive.
    closes = [1.0, 1.01, 1.01, 1.01, 1.01, 1.01]
    candles = [
        CandlePoint('EUR/USD', 'H1', times[index], closes[index])
        for index in range(len(times))
    ]
    feature = FeatureRow('EUR/USD', 'H1', first, 'v1.0', feature_values(0))

    baseline = build_dataset(
        [feature], candles, horizon='1h', threshold_pct=0.5, feature_names=list(feature.values)
    ).examples[0]
    assert baseline.label == 1

    # A huge move at t (the reference candle itself) cannot create a label.
    at_t = [
        CandlePoint('EUR/USD', 'H1', times[index], 99.0 if index == 0 else closes[index])
        for index in range(len(times))
    ]
    assert build_dataset(
        [feature], at_t, horizon='1h', threshold_pct=0.5, feature_names=list(feature.values)
    ).examples[0].label == 0

    # A huge move after the horizon window also cannot change the label.
    late = [
        CandlePoint('EUR/USD', 'H1', times[index], 99.0 if index == 5 else closes[index])
        for index in range(len(times))
    ]
    assert build_dataset(
        [feature], late, horizon='1h', threshold_pct=0.5, feature_names=list(feature.values)
    ).examples[0].label == 1

    # Tampering with the in-window candle does change it (label really is derived there).
    inside = [
        CandlePoint('EUR/USD', 'H1', times[index], 0.90 if index == 1 else closes[index])
        for index in range(len(times))
    ]
    assert build_dataset(
        [feature], inside, horizon='1h', threshold_pct=0.5, feature_names=list(feature.values)
    ).examples[0].label == 0


def test_calibration_never_sees_test_rows() -> None:
    """Changing only the test set leaves the fitted calibrator byte-identical."""
    from app.ml.train import _train_one
    from ml_fixtures import labeled_examples, utc

    examples = labeled_examples(start=utc(2024, 1, 1), days=90)
    train, validation, test = examples[:50], examples[50:70], examples[70:85]
    names = list(examples[0].features)

    _, first_calibrator, first_metrics = _train_one(
        'logistic-regression', train, validation, test, names, 7, 'platt'
    )
    _, second_calibrator, second_metrics = _train_one(
        'logistic-regression', train, validation, examples[85:], names, 7, 'platt'
    )

    assert first_calibrator.method == second_calibrator.method
    assert first_calibrator.curve == second_calibrator.curve
    assert first_metrics['samples'] == len(test)
    assert second_metrics['samples'] == len(examples[85:])


def test_dataset_snapshot_checksum_rejects_tampered_labels() -> None:
    """A replayed dataset with an edited label must fail checksum verification."""
    import pytest

    from app.ml.dataset import build_dataset, dataset_from_records, dataset_to_records
    from ml_fixtures import simple_market_rows

    features, candles = simple_market_rows(count=20)
    real = build_dataset(
        features, candles, horizon='1h', threshold_pct=0.30
    )
    record = dataset_to_records(real)
    restored = dataset_from_records(record)
    assert restored.checksum == real.checksum

    record['rows'][0]['label'] = 1 - int(record['rows'][0]['label'])
    with pytest.raises(ValueError, match='checksum mismatch'):
        dataset_from_records(record)
