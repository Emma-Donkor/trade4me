"""Reference-value gate for every indicator family (PHASE 10).

These expectations are hand-computed or canonical published values. If a
formula changes, these tests fail — that is the point.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.indicators import (
    Candle,
    adx,
    atr,
    bollinger,
    cci,
    compute_all,
    ema,
    historical_volatility,
    macd,
    parse_candles,
    rsi,
    sma,
    stochastic,
)

FIXTURES = json.loads((Path(__file__).parent / 'fixtures' / 'candles.json').read_text(encoding='utf-8'))


def candles_from_closes(closes: list[float], spread: float = 0.01) -> list[Candle]:
    return [
        Candle(
            timestamp=f'2026-01-01T{hour:02d}:00:00.000Z',
            open=close,
            high=close + spread,
            low=close - spread,
            close=close,
            volume=100.0,
        )
        for hour, close in enumerate(closes)
    ]


def rising_candles() -> list[Candle]:
    spec = FIXTURES['rising']
    closes = [spec['start'] + index * spec['step'] for index in range(spec['count'])]
    return candles_from_closes(closes, spread=0.0002)


def test_sma_reference() -> None:
    assert sma([1, 2, 3, 4, 5], 3) == [None, None, 2.0, 3.0, 4.0]


def test_ema_reference_seeded_with_sma() -> None:
    assert ema([1, 2, 3, 4], 3) == [None, None, 2.0, 3.0]


def test_rsi_matches_wilder_canonical_value() -> None:
    values = rsi(FIXTURES['wilderRsi']['closes'], 14)
    assert values[-1] is not None
    # Wilder's published RSI(14) for this series is 70.46.
    assert values[-1] == pytest.approx(70.46, abs=0.5)


def test_rsi_monotonic_series_is_100() -> None:
    values = rsi([1.0 + index for index in range(30)], 14)
    assert values[-1] == 100.0


def test_macd_is_zero_for_constant_series() -> None:
    result = macd([1.1] * 60)
    assert result['macd'][-1] == pytest.approx(0.0)
    assert result['signal'][-1] == pytest.approx(0.0)
    assert result['histogram'][-1] == pytest.approx(0.0)


def test_macd_histogram_positive_on_sustained_uptrend() -> None:
    result = macd([1.0 + index * 0.01 for index in range(60)])
    assert result['macd'][-1] is not None and result['macd'][-1] > 0
    assert result['histogram'][-1] is not None and result['histogram'][-1] > 0


def test_atr_constant_range_is_the_range() -> None:
    values = atr(candles_from_closes([1.0 + index * 0.001 for index in range(40)], spread=0.01))
    assert values[-1] is not None
    assert values[-1] == pytest.approx(0.02, abs=1e-9)


def test_adx_rising_series_is_strong_and_bullish() -> None:
    result = adx(rising_candles())
    assert result['adx'][-1] is not None and result['adx'][-1] > 50
    assert result['plusDi'][-1] is not None and result['minusDi'][-1] is not None
    assert result['plusDi'][-1] > result['minusDi'][-1]


def test_bollinger_uses_population_standard_deviation() -> None:
    bands = bollinger([1, 2, 3, 4], period=3)
    assert bands['middle'][2] == pytest.approx(2.0)
    deviation = math.sqrt(2.0 / 3.0) * 2.0
    assert bands['upper'][2] == pytest.approx(2.0 + deviation)
    assert bands['lower'][2] == pytest.approx(2.0 - deviation)


def test_stochastic_and_cci_on_monotonic_series() -> None:
    candles = rising_candles()
    values = stochastic(candles)
    # The last close sits near (not exactly on) the 14-bar high, so %K is ~98.5.
    assert values['k'][-1] is not None and values['k'][-1] > 98
    assert values['d'][-1] is not None and values['d'][-1] > 98
    assert cci(candles)[-1] is not None and cci(candles)[-1] > 0


def test_historical_volatility_is_positive_and_timeframe_scaled() -> None:
    closes = [1.0 + 0.01 * math.sin(index) for index in range(60)]
    daily = historical_volatility(closes, 'D1')
    hourly = historical_volatility(closes, 'H1')
    assert daily > 0
    assert hourly == pytest.approx(daily * math.sqrt(24))


def test_volume_indicators_flagged_indicative_without_volume() -> None:
    candles = [Candle(c.timestamp, c.open, c.high, c.low, c.close) for c in rising_candles()]
    values = compute_all(candles, 'H1')
    assert values['VWAP']['indicative'] is True
    assert values['OBV']['indicative'] is True
    assert len(values['RSI14']['series']) <= 30


def test_compute_all_honours_name_filter() -> None:
    values = compute_all(rising_candles(), 'H1', ['RSI', 'EMA20'])
    assert set(values) == {'RSI14', 'EMA20'}


def test_malformed_candles_are_rejected() -> None:
    with pytest.raises(ValueError):
        parse_candles([{'timestamp': 'x', 'open': 1, 'high': 0.5, 'low': 1.2, 'close': 1}])


def test_indicators_endpoint_returns_real_engine_output() -> None:
    candles = [
        {
            'timestamp': candle.timestamp,
            'open': candle.open,
            'high': candle.high,
            'low': candle.low,
            'close': candle.close,
            'volume': candle.volume,
        }
        for candle in rising_candles()
    ]
    response = TestClient(app).post(
        '/api/v1/ai/indicators',
        json={'symbol': 'EUR/USD', 'timeframe': 'H1', 'candles': candles},
        headers={'X-Service-Token': 'tradesense-dev-service-token'},
    )
    assert response.status_code == 200
    body = response.json()
    assert body['symbol'] == 'EUR/USD'
    assert set(body['indicators']['RSI14']) >= {'value', 'series'}
    assert body['indicators']['score']['score'] > 0
    assert body['indicators']['regime']['regime'] == 'STRONG_UPTREND'


def test_indicators_endpoint_bounds_the_window() -> None:
    response = TestClient(app).post(
        '/api/v1/ai/indicators',
        json={'symbol': 'EUR/USD', 'timeframe': 'H1', 'candles': [{}] * 501},
        headers={'X-Service-Token': 'tradesense-dev-service-token'},
    )
    assert response.status_code == 422
