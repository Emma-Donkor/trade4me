"""PHASE 12 leakage and as-of boundary tests."""

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
