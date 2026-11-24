"""Regime classifier tests, including UNCERTAIN as a first-class output."""

from __future__ import annotations

from app.services.indicators import Candle
from app.services.regime import classify


def series(values: list[float], spread: float) -> list[Candle]:
    return [
        Candle(
            timestamp=f'2026-01-01T{index:04d}:00:00.000Z',
            open=value,
            high=value + spread / 2,
            low=value - spread / 2,
            close=value,
            volume=100.0,
        )
        for index, value in enumerate(values)
    ]


def test_strong_uptrend() -> None:
    candles = series([1.0 + index * 0.002 for index in range(120)], 0.0002)
    result = classify(candles)
    assert result['regime'] == 'STRONG_UPTREND'
    assert result['evidence']['adx'] > 25


def test_strong_downtrend() -> None:
    candles = series([2.0 - index * 0.002 for index in range(120)], 0.0002)
    result = classify(candles)
    assert result['regime'] == 'STRONG_DOWNTREND'


def test_range_on_flat_series() -> None:
    candles = series([1.1 + (index % 2) * 0.0002 for index in range(120)], 0.0004)
    result = classify(candles)
    assert result['regime'] == 'RANGE'


def test_high_volatility_override() -> None:
    values = [1.1 + (index % 2) * 0.0002 for index in range(90)]
    candles = series(values, 0.0004) + series([1.1] * 12, 0.08)
    result = classify(candles)
    assert result['regime'] == 'HIGH_VOLATILITY'
    assert result['evidence']['reason'] == 'atr_expansion'


def test_uncertain_with_insufficient_history() -> None:
    candles = series([1.0 + index * 0.001 for index in range(20)], 0.001)
    result = classify(candles)
    assert result['regime'] == 'UNCERTAIN'
    assert result['confidence'] == 0.0


def test_evidence_fields_are_always_present() -> None:
    result = classify(series([1.1] * 60, 0.001))
    assert set(result['evidence']) >= {
        'adx',
        'plusDi',
        'minusDi',
        'atrPercentile',
        'priceVsEma200Pct',
        'emaStack',
        'emaSlopePct',
        'reason',
    }
