"""Candlestick geometry tests — detections must be specific, not generic."""

from __future__ import annotations

from app.services.indicators import Candle
from app.services.patterns import ALL_PATTERNS, detect_patterns


def bar(open: float, high: float, low: float, close: float, hour: int = 0) -> Candle:
    return Candle(
        timestamp=f'2026-01-01T{hour:02d}:00:00.000Z',
        open=open,
        high=high,
        low=low,
        close=close,
        volume=100.0,
    )


def base(hour: int = 0) -> list[Candle]:
    """Neutral context bars so pattern context fields can be computed."""
    # Body is ~15% of the range: neutral, but deliberately not a doji.
    return [
        bar(1.1, 1.102, 1.098, 1.1006 + (index % 2) * 0.0002, index)
        for index in range(hour, hour + 10)
    ]


def names(candles: list[Candle], target: str | None = None) -> list[str]:
    detections = detect_patterns(candles, [target] if target else None)
    return [item['pattern'] for item in detections]


def test_doji_detected_only_with_tiny_body() -> None:
    assert 'DOJI' in names(base() + [bar(1.100, 1.105, 1.095, 1.100, 10)], 'DOJI')
    assert 'DOJI' not in names(base() + [bar(1.100, 1.105, 1.095, 1.104, 10)], 'DOJI')


def test_hammer_requires_long_lower_wick() -> None:
    candles = base() + [bar(1.102, 1.107, 1.080, 1.105, 10)]
    assert 'HAMMER' in names(candles, 'HAMMER')
    assert 'HAMMER' not in names(base() + [bar(1.102, 1.107, 1.099, 1.105, 10)], 'HAMMER')


def test_inverted_hammer_and_shooting_star() -> None:
    inverted = base() + [bar(1.083, 1.110, 1.081, 1.085, 10)]
    assert 'INVERTED_HAMMER' in names(inverted, 'INVERTED_HAMMER')
    star = base() + [bar(1.100, 1.130, 1.099, 1.104, 10)]
    assert 'SHOOTING_STAR' in names(star, 'SHOOTING_STAR')


def test_bullish_and_bearish_engulfing() -> None:
    bullish = base() + [bar(1.100, 1.101, 1.089, 1.090, 10), bar(1.085, 1.112, 1.084, 1.110, 11)]
    assert 'BULLISH_ENGULFING' in names(bullish, 'BULLISH_ENGULFING')
    bearish = base() + [bar(1.090, 1.111, 1.089, 1.110, 10), bar(1.112, 1.113, 1.084, 1.086, 11)]
    assert 'BEARISH_ENGULFING' in names(bearish, 'BEARISH_ENGULFING')


def test_morning_and_evening_star() -> None:
    morning = base() + [
        bar(1.110, 1.111, 1.085, 1.087, 10),
        bar(1.088, 1.092, 1.086, 1.089, 11),
        bar(1.090, 1.115, 1.089, 1.112, 12),
    ]
    assert 'MORNING_STAR' in names(morning, 'MORNING_STAR')
    evening = base() + [
        bar(1.085, 1.114, 1.084, 1.112, 10),
        bar(1.111, 1.114, 1.108, 1.110, 11),
        bar(1.109, 1.110, 1.083, 1.086, 12),
    ]
    assert 'EVENING_STAR' in names(evening, 'EVENING_STAR')


def test_harami_inside_previous_body() -> None:
    candles = base() + [
        bar(1.090, 1.112, 1.088, 1.110, 10),
        bar(1.100, 1.106, 1.099, 1.104, 11),
    ]
    assert 'HARAMI' in names(candles, 'HARAMI')


def test_detections_carry_context_and_are_never_predictions() -> None:
    candles = base() + [bar(1.102, 1.107, 1.080, 1.105, 10)]
    detections = detect_patterns(candles, ['HAMMER'])
    assert detections
    detection = detections[0]
    assert detection['pattern'] == 'HAMMER'
    assert 0 <= detection['score'] <= 100
    assert set(detection['context']) >= {
        'trend',
        'regime',
        'supportResistanceDistancePct',
        'volatilityPct',
        'momentum',
    }
    assert 'prediction' not in detection


def test_unknown_pattern_rejected() -> None:
    try:
        detect_patterns(base(), ['MAGIC'])
    except ValueError as exc:
        assert 'MAGIC' in str(exc)
    else:
        raise AssertionError('unknown pattern must be rejected')


def test_all_pattern_names_are_the_documented_nine() -> None:
    assert len(ALL_PATTERNS) == 9
