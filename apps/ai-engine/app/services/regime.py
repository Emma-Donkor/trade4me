"""Market regime classification from ADX, EMA structure and ATR percentile.

``UNCERTAIN`` is a first-class result: when the evidence conflicts or the
window is too short, the classifier refuses to guess (README §10.3).
"""

from __future__ import annotations

from typing import Any, Sequence

from .indicators import Candle, adx, atr, ema

MIN_BARS = 50
STRONG_ADX = 25.0
WEAK_ADX = 20.0
HIGH_VOLATILE_PERCENTILE = 85.0
LOW_VOLATILE_PERCENTILE = 15.0
VOLATILITY_EXPANSION_RATIO = 1.5
VOLATILITY_COMPRESSION_RATIO = 0.7
ATR_WARMUP_BARS = 28
ATR_RECENT_BARS = 14


def _percentile(values: Sequence[float], value: float) -> float:
    if not values:
        return 50.0
    below = sum(1 for item in values if item < value)
    equal = sum(1 for item in values if item == value)
    return (below + 0.5 * equal) / len(values) * 100.0


def classify(candles: Sequence[Candle], slope_bars: int = 10) -> dict[str, Any]:
    """Return a regime label, confidence and the evidence that produced it."""
    closes = [candle.close for candle in candles]
    directional = adx(candles)
    atr_values = atr(candles)
    ema20 = ema(closes, 20)
    ema50 = ema(closes, 50)
    ema200 = ema(closes, 200)
    # Normalise by price and discard the Wilder warm-up ramp; a raw ATR percentile
    # would label every steady uptrend "high volatility" just because ATR is
    # still converging towards its steady state.
    atr_pct_series = [
        float(value) / candles[index].close * 100.0
        for index, value in enumerate(atr_values)
        if value is not None and candles[index].close > 0
    ]
    mature_atr = atr_pct_series[ATR_WARMUP_BARS:]
    atr_window = mature_atr[-100:]
    atr_percentile = _percentile(atr_window, atr_window[-1]) if atr_window else 50.0
    recent_atr = atr_window[-ATR_RECENT_BARS:]
    baseline_atr = atr_window[:-ATR_RECENT_BARS] or atr_window
    expansion_ratio = (
        (sum(recent_atr) / len(recent_atr)) / (sum(baseline_atr) / len(baseline_atr))
        if baseline_atr and sum(baseline_atr) > 0
        else 1.0
    )
    latest_adx = float(directional['adx'][-1]) if directional['adx'][-1] is not None else 0.0
    plus_di = float(directional['plusDi'][-1]) if directional['plusDi'][-1] is not None else 0.0
    minus_di = float(directional['minusDi'][-1]) if directional['minusDi'][-1] is not None else 0.0

    evidence: dict[str, Any] = {
        'adx': round(latest_adx, 4),
        'plusDi': round(plus_di, 4),
        'minusDi': round(minus_di, 4),
        'atrPercentile': round(atr_percentile, 2),
        'atrExpansionRatio': round(expansion_ratio, 4),
        'priceVsEma200Pct': None,
        'emaStack': None,
        'emaSlopePct': None,
        'reason': 'insufficient_history',
    }

    def result(regime: str, confidence: float) -> dict[str, Any]:
        return {
            'regime': regime,
            'confidence': round(confidence, 4),
            'evidence': evidence,
        }

    if len(candles) < MIN_BARS or not atr_window:
        return result('UNCERTAIN', 0.0)

    slope_index = len(candles) - 1 - slope_bars
    slope = 0.0
    if slope_index >= 0 and ema20[-1] is not None and ema20[slope_index] is not None:
        slope = (
            (float(ema20[-1]) - float(ema20[slope_index]))
            / max(float(ema20[slope_index]), 1e-12)
            * 100
        )
    stack = (
        float(ema20[-1]) > float(ema50[-1])
        if ema20[-1] is not None and ema50[-1] is not None
        else None
    )
    above_ema200 = None
    if ema200[-1] is not None:
        above_ema200 = (closes[-1] / float(ema200[-1]) - 1.0) * 100.0
    evidence.update(
        {
            'priceVsEma200Pct': None if above_ema200 is None else round(above_ema200, 4),
            'emaStack': stack,
            'emaSlopePct': round(slope, 4),
        }
    )

    # Volatility expansion/compression dominates directional evidence. The
    # recent-vs-baseline ratio avoids mistaking a steady trend (where ATR as a
    # percentage of price drifts) for a volatility regime.
    if expansion_ratio >= VOLATILITY_EXPANSION_RATIO or (
        atr_percentile >= HIGH_VOLATILE_PERCENTILE and expansion_ratio > 1.2
    ):
        evidence['reason'] = 'atr_expansion'
        return result('HIGH_VOLATILITY', min(1.0, expansion_ratio / 3.0))
    if expansion_ratio <= VOLATILITY_COMPRESSION_RATIO or (
        atr_percentile <= LOW_VOLATILE_PERCENTILE and expansion_ratio < 0.85
    ):
        evidence['reason'] = 'atr_compression'
        return result('LOW_VOLATILITY', min(1.0, (1.0 - expansion_ratio) / 0.5))

    bullish = plus_di > minus_di and stack is True and slope > 0.1
    bearish = minus_di > plus_di and stack is False and slope < -0.1
    strong = latest_adx >= STRONG_ADX and (above_ema200 is None or (above_ema200 > 0) == bullish)
    trending = latest_adx >= WEAK_ADX

    if trending and bullish:
        evidence['reason'] = 'adx_ema_bullish'
        return result(
            'STRONG_UPTREND' if strong else 'WEAK_UPTREND',
            min(1.0, latest_adx / 50.0),
        )
    if trending and bearish:
        evidence['reason'] = 'adx_ema_bearish'
        return result(
            'STRONG_DOWNTREND' if strong else 'WEAK_DOWNTREND',
            min(1.0, latest_adx / 50.0),
        )
    if latest_adx < WEAK_ADX and abs(slope) <= 0.5:
        evidence['reason'] = 'low_adx_flat_ema'
        return result('RANGE', 1.0 - latest_adx / WEAK_ADX)
    evidence['reason'] = 'conflicting_evidence'
    return result('UNCERTAIN', 0.0)
