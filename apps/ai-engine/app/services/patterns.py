"""Candlestick pattern detection with context — PHASE 10.

A detection is *evidence*, never a trade instruction: every result carries the
trend/regime, distance to the nearest support/resistance level, ATR volatility
and RSI momentum that existed at the time of the pattern.
"""

from __future__ import annotations

from typing import Any, Sequence

from .indicators import (
    Candle,
    atr,
    ema,
    rsi,
    support_resistance,
)
from .regime import classify

DOJI_BODY_RATIO = 0.1
HAMMER_WICK_RATIO = 2.0
STAR_BODY_RATIO = 0.3

ALL_PATTERNS = (
    'DOJI',
    'HAMMER',
    'INVERTED_HAMMER',
    'SHOOTING_STAR',
    'BULLISH_ENGULFING',
    'BEARISH_ENGULFING',
    'MORNING_STAR',
    'EVENING_STAR',
    'HARAMI',
)


def _body(candle: Candle) -> float:
    return abs(candle.close - candle.open)


def _range(candle: Candle) -> float:
    return candle.high - candle.low


def _ratios(candle: Candle) -> tuple[float, float, float, float]:
    """Return body/range, upper/body, lower/body ratios and the real range."""
    span = _range(candle)
    body = _body(candle)
    if span <= 0:
        return 0.0, 0.0, 0.0, 0.0
    upper = candle.high - max(candle.open, candle.close)
    lower = min(candle.open, candle.close) - candle.low
    return body / span, upper / max(body, 1e-12), lower / max(body, 1e-12), span


def _context(candles: Sequence[Candle], index: int) -> dict[str, Any]:
    window = candles[: index + 1]
    closes = [candle.close for candle in window]
    ema20 = ema(closes, 20)
    ema50 = ema(closes, 50)
    slope = 0.0
    if len(window) >= 21 and ema20[-1] is not None and ema20[-21] is not None:
        slope = (float(ema20[-1]) - float(ema20[-21])) / max(float(ema20[-21]), 1e-12) * 100
    trend = 'UP' if slope > 0.5 else 'DOWN' if slope < -0.5 else 'RANGE'
    if len(window) >= 3 and ema20[-1] is not None and ema50[-1] is not None:
        if float(ema20[-1]) > float(ema50[-1]) and trend == 'RANGE':
            trend = 'UP'
        elif float(ema20[-1]) < float(ema50[-1]) and trend == 'RANGE':
            trend = 'DOWN'
    atr_values = atr(window)
    atr_pct = (float(atr_values[-1]) / closes[-1] * 100) if atr_values[-1] and closes[-1] else 0.0
    rsi_values = rsi(closes)
    momentum = float(rsi_values[-1]) if rsi_values[-1] is not None else 50.0
    levels = support_resistance(window)
    nearby = [level for group in levels.values() for level in group]
    distance = 100.0
    if nearby:
        distance = min(abs(closes[-1] - level['value']) / max(closes[-1], 1e-12) * 100 for level in nearby)
    return {
        'trend': trend,
        'regime': classify(window)['regime'],
        'supportResistanceDistancePct': round(distance, 4),
        'volatilityPct': round(atr_pct, 4),
        'momentum': round(momentum, 2),
    }


def _detection(
    pattern: str, candle: Candle, index: int, candles: Sequence[Candle], strength: float
) -> dict[str, Any]:
    body_ratio, upper_ratio, lower_ratio, span = _ratios(candle)
    score = max(0.0, min(100.0, 50.0 + strength * 50.0))
    return {
        'pattern': pattern,
        'score': round(score, 2),
        'detectedAt': candle.timestamp,
        'bodyRatio': round(body_ratio, 4),
        'rangeRatio': round(span / max(candle.close, 1e-12), 6),
        'upperWickRatio': round(upper_ratio, 4),
        'lowerWickRatio': round(lower_ratio, 4),
        'context': _context(candles, index),
    }


def detect_patterns(
    candles: Sequence[Candle], patterns: Sequence[str] | None = None
) -> list[dict[str, Any]]:
    """Detect the requested patterns; an empty selection means all of them."""
    selected = set(patterns or ALL_PATTERNS)
    unknown = selected.difference(ALL_PATTERNS)
    if unknown:
        raise ValueError(f'Unknown patterns: {sorted(unknown)}')
    results: list[dict[str, Any]] = []
    for index, candle in enumerate(candles):
        body_ratio, upper_ratio, lower_ratio, span = _ratios(candle)
        if span <= 0:
            continue
        bullish = candle.close > candle.open
        bearish = candle.close < candle.open

        if 'DOJI' in selected and body_ratio <= DOJI_BODY_RATIO:
            results.append(
                _detection('DOJI', candle, index, candles, 1.0 - body_ratio / DOJI_BODY_RATIO)
            )
        if 'HAMMER' in selected and lower_ratio >= HAMMER_WICK_RATIO and upper_ratio <= 1.0 and span:
            results.append(
                _detection('HAMMER', candle, index, candles, min(1.0, lower_ratio / 3.0) * 0.9)
            )
        if 'INVERTED_HAMMER' in selected and upper_ratio >= HAMMER_WICK_RATIO and lower_ratio <= 1.0:
            results.append(
                _detection(
                    'INVERTED_HAMMER', candle, index, candles, min(1.0, upper_ratio / 3.0) * 0.9
                )
            )
        if (
            'SHOOTING_STAR' in selected
            and upper_ratio >= HAMMER_WICK_RATIO
            and lower_ratio <= 1.0
            and index > 0
            and candle.close > candles[index - 1].close
        ):
            results.append(
                _detection(
                    'SHOOTING_STAR', candle, index, candles, min(1.0, upper_ratio / 3.0) * 0.9
                )
            )
        if index == 0:
            continue
        previous = candles[index - 1]

        if 'BULLISH_ENGULFING' in selected and bullish and previous.close < previous.open:
            if candle.close >= previous.open and candle.open <= previous.close:
                strength = min(1.0, (_body(candle) / max(_body(previous), 1e-12) - 1.0) / 2.0)
                results.append(
                    _detection('BULLISH_ENGULFING', candle, index, candles, strength)
                )
        if 'BEARISH_ENGULFING' in selected and bearish and previous.close > previous.open:
            if candle.close <= previous.open and candle.open >= previous.close:
                strength = min(1.0, (_body(candle) / max(_body(previous), 1e-12) - 1.0) / 2.0)
                results.append(
                    _detection('BEARISH_ENGULFING', candle, index, candles, strength)
                )
        if index == 0:
            continue

        if 'HARAMI' in selected and _body(candle) < _body(previous) and span <= _range(previous):
            if previous.open <= candle.close <= previous.close or previous.close <= candle.close <= previous.open:
                results.append(
                    _detection(
                        'HARAMI', candle, index, candles, 1.0 - _body(candle) / max(_body(previous), 1e-12)
                    )
                )
        if index < 2:
            continue
        first, middle = candles[index - 2], candles[index - 1]

        if 'MORNING_STAR' in selected and first.close < first.open and bullish:
            middle_body = _body(middle)
            if middle_body <= max(_body(first) * STAR_BODY_RATIO, 1e-12):
                midpoint = (first.open + first.close) / 2.0
                if candle.close > midpoint:
                    results.append(
                        _detection(
                            'MORNING_STAR', candle, index, candles, min(1.0, middle_body / max(_body(first), 1e-12) + 0.5)
                        )
                    )
        if 'EVENING_STAR' in selected and first.close > first.open and bearish:
            middle_body = _body(middle)
            if middle_body <= max(_body(first) * STAR_BODY_RATIO, 1e-12):
                midpoint = (first.open + first.close) / 2.0
                if candle.close < midpoint:
                    results.append(
                        _detection(
                            'EVENING_STAR', candle, index, candles, min(1.0, middle_body / max(_body(first), 1e-12) + 0.5)
                        )
                    )
    return results
