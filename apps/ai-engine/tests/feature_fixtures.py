"""Deterministic fixtures shared by the PHASE 12 feature tests."""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any

START = datetime(2026, 1, 5, 0, 0, 0, tzinfo=timezone.utc)  # Monday
SERVICE_HEADERS = {'X-Service-Token': 'tradesense-dev-service-token'}


def iso(offset: int) -> str:
    return (START + timedelta(hours=offset)).strftime('%Y-%m-%dT%H:%M:%S.000Z')


def candles(
    count: int = 260,
    *,
    price: float = 1.1,
    step: float = 0.0004,
    spread: float = 0.0004,
    start_offset: int = 0,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index in range(count):
        close = price + index * step
        rows.append(
            {
                'timestamp': iso(start_offset + index),
                'open': close,
                'high': close + spread,
                'low': close - spread,
                'close': close,
                'volume': 100.0,
            }
        )
    return rows


def oscillating_candles(count: int = 260) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index in range(count):
        close = 1.1 + 0.01 * math.sin(index / 5.0)
        rows.append(
            {
                'timestamp': iso(index),
                'open': close,
                'high': close + 0.002,
                'low': close - 0.002,
                'close': close,
                'volume': 100.0,
            }
        )
    return rows


def peer_candles(
    ratio: float, start: float = 1.0, count: int = 25, start_offset: int = 0
) -> list[dict[str, Any]]:
    """25 bars aligned to UTC hours whose 24-bar simple return is ``ratio``."""
    return [
        {
            'timestamp': iso(start_offset + index),
            'open': start + (start * ratio - start) * index / (count - 1),
            'high': start + (start * ratio - start) * index / (count - 1) + 0.0001,
            'low': start + (start * ratio - start) * index / (count - 1) - 0.0001,
            'close': start + (start * ratio - start) * index / (count - 1),
            'volume': 100.0,
        }
        for index in range(count)
    ]


def request_payload(rows: list[dict[str, Any]] | None = None, **overrides: Any) -> dict[str, Any]:
    candles = rows if rows is not None else oscillating_candles()
    payload: dict[str, Any] = {
        'symbol': 'EUR/USD',
        'timeframe': 'H1',
        'featureVersion': 'v1.0',
        'asOf': candles[-1]['timestamp'],
        'candles': candles,
        'peerCandles': {},
        'news': [],
        'events': [],
        'regime': None,
        'timestamps': [candles[-1]['timestamp']],
    }
    payload.update(overrides)
    return payload


def news_item(
    published_at: str, sentiment: str = 'BULLISH', impact: str = 'HIGH', symbol: str = 'EUR/USD'
) -> dict[str, Any]:
    return {
        'publishedAt': published_at,
        'currencies': ['EUR', 'USD'],
        'affectedPairs': [symbol],
        'sentiment': sentiment,
        'impact': impact,
        'confidence': 0.8,
    }


def event_item(scheduled_at: str, impact: str = 'EXTREME', currency: str = 'USD') -> dict[str, Any]:
    return {
        'scheduledAt': scheduled_at,
        'currency': currency,
        'impact': impact,
    }
