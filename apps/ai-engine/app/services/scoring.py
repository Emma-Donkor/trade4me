"""Deterministic technical score (0–100) from indicators, patterns and regime.

Sub-weight constants mirror ``packages/config/src/weights.ts``; a parity test
keeps the two languages in lockstep. No ML and no network access here.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

TECHNICAL_SUBWEIGHTS: dict[str, float] = {
    'trend': 0.30,
    'momentum': 0.20,
    'volatility': 0.10,
    'levels': 0.15,
    'patterns': 0.15,
    'regime': 0.10,
}

BULLISH_REGIMES = {'STRONG_UPTREND', 'WEAK_UPTREND'}
BEARISH_REGIMES = {'STRONG_DOWNTREND', 'WEAK_DOWNTREND'}


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _number(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if result == result and abs(result) != float('inf') else default


def trend_subscore(indicators: Mapping[str, Any]) -> float:
    adx = indicators.get('ADX14', {}).get('value', {})
    macd = indicators.get('MACD', {}).get('value', {})
    ema20 = _number(indicators.get('EMA20', {}).get('value'))
    ema50 = _number(indicators.get('EMA50', {}).get('value'))
    ema200 = _number(indicators.get('EMA200', {}).get('value'))
    score = 50.0
    if ema20 and ema50:
        score += 12.0 if ema20 > ema50 else -12.0
    if ema200:
        close = _number(indicators.get('VWAP', {}).get('value'))
        if close:
            score += 10.0 if close > ema200 else -10.0
    score += clamp(_number(adx.get('plusDi')) - _number(adx.get('minusDi')), -25.0, 25.0) * 0.4
    score += clamp(_number(macd.get('histogram')) * 500.0, -15.0, 15.0)
    return clamp(score)


def momentum_subscore(indicators: Mapping[str, Any]) -> float:
    rsi = _number(indicators.get('RSI14', {}).get('value'), 50.0)
    roc = _number(indicators.get('ROC12', {}).get('value'))
    stoch = indicators.get('STOCH14', {}).get('value', {})
    score = clamp((rsi - 50.0) * 0.8 + 50.0)
    if rsi > 70:
        score -= (rsi - 70.0) * 1.5
    elif rsi < 30:
        score += (30.0 - rsi) * 1.5
    score += clamp(roc * 4.0, -15.0, 15.0)
    score += (clamp(_number(stoch.get('k')), 0.0, 100.0) - 50.0) * 0.2
    return clamp(score)


def volatility_subscore(indicators: Mapping[str, Any]) -> float:
    atr = _number(indicators.get('ATR14', {}).get('value'))
    vwap = _number(indicators.get('VWAP', {}).get('value'))
    if not atr or not vwap:
        return 50.0
    atr_pct = atr / max(vwap, 1e-12) * 100.0
    # Moderate volatility is healthy; extremes reduce conviction.
    return clamp(100.0 - abs(atr_pct - 1.0) * 40.0)


def levels_subscore(indicators: Mapping[str, Any], bullish: bool) -> float:
    levels = indicators.get('LEVELS', {}).get('value', {})
    supports = levels.get('support', [])
    resistances = levels.get('resistance', [])
    price = _number(indicators.get('VWAP', {}).get('value'))
    if not price or (not supports and not resistances):
        return 50.0
    support_gap = min((abs(price - item['value']) / max(price, 1e-12) for item in supports), default=1.0)
    resistance_gap = min(
        (abs(price - item['value']) / max(price, 1e-12) for item in resistances), default=1.0
    )
    if bullish:
        return clamp(60.0 + (1.0 - min(support_gap, 0.1) / 0.1) * 40.0 - resistance_gap * 100.0)
    return clamp(60.0 + (1.0 - min(resistance_gap, 0.1) / 0.1) * 40.0 - support_gap * 100.0)


def patterns_subscore(patterns: Sequence[Mapping[str, Any]], bullish: bool) -> float:
    if not patterns:
        return 50.0
    bullish_patterns = {'HAMMER', 'INVERTED_HAMMER', 'BULLISH_ENGULFING', 'MORNING_STAR', 'HARAMI'}
    bearish_patterns = {'SHOOTING_STAR', 'BEARISH_ENGULFING', 'EVENING_STAR', 'HARAMI'}
    score = 50.0
    weight = 0.0
    for pattern in patterns[-5:]:
        name = pattern.get('pattern')
        strength = clamp(_number(pattern.get('score'))) / 100.0
        direction = 0.0
        if name in bullish_patterns:
            direction += 1.0
        if name in bearish_patterns:
            direction -= 1.0
        if name == 'HARAMI':
            direction = 1.0 if bullish else -1.0
        score += direction * strength * 25.0
        weight += 1.0
    return clamp(score if weight else 50.0)


def regime_subscore(regime: Mapping[str, Any]) -> float:
    label = regime.get('regime')
    confidence = clamp(_number(regime.get('confidence')) * 100.0)
    if label in BULLISH_REGIMES:
        return clamp(50.0 + confidence * 0.5)
    if label in BEARISH_REGIMES:
        return clamp(50.0 - confidence * 0.5)
    if label == 'RANGE':
        return 50.0
    return 50.0


def score_technical(
    indicators: Mapping[str, Any],
    patterns: Sequence[Mapping[str, Any]],
    regime: Mapping[str, Any],
    weights: Mapping[str, float] | None = None,
) -> dict[str, Any]:
    """Weighted technical evidence score, always bounded to [0, 100]."""
    effective = dict(weights or TECHNICAL_SUBWEIGHTS)
    if set(effective) != set(TECHNICAL_SUBWEIGHTS) or abs(sum(effective.values()) - 1.0) > 1e-9:
        raise ValueError('Technical sub-weights must match the configured manifest and sum to 1')
    label = regime.get('regime')
    bullish = label in BULLISH_REGIMES
    bearish = label in BEARISH_REGIMES
    subscores = {
        'trend': trend_subscore(indicators),
        'momentum': momentum_subscore(indicators),
        'volatility': volatility_subscore(indicators),
        'levels': levels_subscore(indicators, bullish if bullish or bearish else True),
        'patterns': patterns_subscore(patterns, bullish if bullish or bearish else True),
        'regime': regime_subscore(regime),
    }
    score = sum(subscores[key] * effective[key] for key in effective)
    return {
        'score': round(clamp(score), 2),
        'subScores': {key: round(value, 2) for key, value in subscores.items()},
        'weights': effective,
        'regime': label,
        'evidenceCount': len(patterns) + sum(1 for item in indicators.values() if item.get('value') is not None),
    }
