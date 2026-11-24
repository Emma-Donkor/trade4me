"""Technical indicators — the single math authority for PHASE 10.

Pure, deterministic Python (no pandas/numpy runtime dependency). Each public
function is independently testable and the aggregate ``compute_all`` returns
only the latest value plus a short, bounded tail series for charting/scoring.

Conventions
-----------
* Wilder smoothing (RMA) is used for RSI, ATR and ADX, matching TA-Lib and
  pandas-ta defaults.
* Bollinger Bands use the population standard deviation (pandas-ta default).
* ``OBV`` and ``VWAP`` set ``indicative=True`` because spot forex has no
  centralised volume; the API must surface that caveat to clients.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

IndicatorValue = float | None

BARS_PER_YEAR: dict[str, int] = {
    'M1': 365 * 24 * 60,
    'M5': 365 * 24 * 12,
    'M15': 365 * 24 * 4,
    'M30': 365 * 24 * 2,
    'H1': 365 * 24,
    'H4': 365 * 6,
    'D1': 365,
    'W1': 52,
    'MN1': 12,
}

SERIES_TAIL = 30


@dataclass(frozen=True)
class Candle:
    """Normalised OHLCV bar. Timestamps are ISO-8601 strings, ascending."""

    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


def parse_candles(rows: Sequence[Mapping[str, Any]]) -> list[Candle]:
    """Validate and order an untrusted candle window."""
    candles: list[Candle] = []
    for row in rows:
        try:
            candle = Candle(
                timestamp=str(row['timestamp']),
                open=float(row['open']),
                high=float(row['high']),
                low=float(row['low']),
                close=float(row['close']),
                volume=None if row.get('volume') is None else float(row['volume']),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError('Malformed candle in indicators request') from exc
        if not all(math.isfinite(value) for value in (candle.open, candle.high, candle.low, candle.close)):
            raise ValueError('Non-finite candle price')
        if candle.high < max(candle.open, candle.close) or candle.low > min(candle.open, candle.close):
            raise ValueError('Candle high/low does not contain open/close')
        candles.append(candle)
    candles.sort(key=lambda candle: candle.timestamp)
    return candles


def _require_period(period: int) -> None:
    if period < 1:
        raise ValueError('Indicator period must be >= 1')


def sma(values: Sequence[float], period: int) -> list[IndicatorValue]:
    """Simple moving average; ``None`` until ``period`` samples exist."""
    _require_period(period)
    result: list[IndicatorValue] = [None] * len(values)
    total = 0.0
    for index, value in enumerate(values):
        total += value
        if index >= period:
            total -= values[index - period]
        if index >= period - 1:
            result[index] = total / period
    return result


def ema(values: Sequence[float], period: int) -> list[IndicatorValue]:
    """EMA seeded with the first SMA (the standard pandas-ta/TA-Lib seed)."""
    _require_period(period)
    result: list[IndicatorValue] = [None] * len(values)
    if len(values) < period:
        return result
    seed = sum(values[:period]) / period
    result[period - 1] = seed
    alpha = 2.0 / (period + 1.0)
    for index in range(period, len(values)):
        result[index] = values[index] * alpha + float(result[index - 1]) * (1.0 - alpha)
    return result


def wilder(values: Sequence[float], period: int) -> list[IndicatorValue]:
    """Wilder's smoothing (RMA), seeded with the first SMA."""
    _require_period(period)
    result: list[IndicatorValue] = [None] * len(values)
    if len(values) < period:
        return result
    previous = sum(values[:period]) / period
    result[period - 1] = previous
    for index in range(period, len(values)):
        previous = (previous * (period - 1) + values[index]) / period
        result[index] = previous
    return result


def rsi(values: Sequence[float], period: int = 14) -> list[IndicatorValue]:
    """Wilder RSI. A flat series with gains only is 100, losses only is 0."""
    _require_period(period)
    result: list[IndicatorValue] = [None] * len(values)
    if len(values) <= period:
        return result
    gains = [max(values[i] - values[i - 1], 0.0) for i in range(1, len(values))]
    losses = [max(values[i - 1] - values[i], 0.0) for i in range(1, len(values))]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    def value(gain: float, loss: float) -> float:
        if loss == 0:
            return 100.0 if gain > 0 else 50.0
        return 100.0 - 100.0 / (1.0 + gain / loss)

    result[period] = value(avg_gain, avg_loss)
    for index in range(period + 1, len(values)):
        avg_gain = (avg_gain * (period - 1) + gains[index - 1]) / period
        avg_loss = (avg_loss * (period - 1) + losses[index - 1]) / period
        result[index] = value(avg_gain, avg_loss)
    return result


def macd(
    values: Sequence[float], fast: int = 12, slow: int = 26, signal: int = 9
) -> dict[str, list[IndicatorValue]]:
    """MACD line, signal line and histogram."""
    _require_period(fast)
    _require_period(slow)
    _require_period(signal)
    fast_line = ema(values, fast)
    slow_line = ema(values, slow)
    line: list[IndicatorValue] = [
        fast - slow if fast is not None and slow is not None else None
        for fast, slow in zip(fast_line, slow_line)
    ]
    valid = [item for item in line if item is not None]
    signal_series = ema(valid, signal)
    signal_line: list[IndicatorValue] = [None] * len(values)
    iterator = iter(signal_series)
    for index, item in enumerate(line):
        if item is not None:
            signal_line[index] = next(iterator)
    histogram: list[IndicatorValue] = [
        item - sig if item is not None and sig is not None else None
        for item, sig in zip(line, signal_line)
    ]
    return {'macd': line, 'signal': signal_line, 'histogram': histogram}


def true_range(candles: Sequence[Candle]) -> list[float]:
    ranges: list[float] = []
    for index, candle in enumerate(candles):
        if index == 0:
            ranges.append(candle.high - candle.low)
            continue
        previous_close = candles[index - 1].close
        ranges.append(
            max(
                candle.high - candle.low,
                abs(candle.high - previous_close),
                abs(candle.low - previous_close),
            )
        )
    return ranges


def atr(candles: Sequence[Candle], period: int = 14) -> list[IndicatorValue]:
    """Average True Range (Wilder)."""
    return wilder(true_range(candles), period)


def adx(candles: Sequence[Candle], period: int = 14) -> dict[str, list[IndicatorValue]]:
    """ADX plus +DI/-DI. Needs at least ``2 * period`` bars for a value."""
    _require_period(period)
    size = len(candles)
    plus_dm = [0.0] * size
    minus_dm = [0.0] * size
    for index in range(1, size):
        up = candles[index].high - candles[index - 1].high
        down = candles[index - 1].low - candles[index].low
        if up > down and up > 0:
            plus_dm[index] = up
        if down > up and down > 0:
            minus_dm[index] = down
    ranges = true_range(candles)
    smooth_plus = wilder(plus_dm, period)
    smooth_minus = wilder(minus_dm, period)
    smooth_tr = wilder(ranges, period)
    plus_di: list[IndicatorValue] = [None] * size
    minus_di: list[IndicatorValue] = [None] * size
    dx: list[IndicatorValue] = [None] * size
    for index in range(size):
        tr = smooth_tr[index]
        if tr is None or tr == 0 or smooth_plus[index] is None or smooth_minus[index] is None:
            continue
        plus = 100.0 * float(smooth_plus[index]) / tr
        minus = 100.0 * float(smooth_minus[index]) / tr
        plus_di[index], minus_di[index] = plus, minus
        total = plus + minus
        dx[index] = 100.0 * abs(plus - minus) / total if total else 0.0
    valid_dx = [item for item in dx if item is not None]
    smooth_dx = wilder(valid_dx, period)
    adx_line: list[IndicatorValue] = [None] * size
    iterator = iter(smooth_dx)
    for index, item in enumerate(dx):
        if item is not None:
            adx_line[index] = next(iterator)
    return {'adx': adx_line, 'plusDi': plus_di, 'minusDi': minus_di}


def stochastic(
    candles: Sequence[Candle], k_period: int = 14, smooth_k: int = 3, d_period: int = 3
) -> dict[str, list[IndicatorValue]]:
    """Slow stochastic oscillator (14/3/3)."""
    _require_period(k_period)
    raw: list[IndicatorValue] = [None] * len(candles)
    for index in range(k_period - 1, len(candles)):
        window = candles[index - k_period + 1 : index + 1]
        highest = max(candle.high for candle in window)
        lowest = min(candle.low for candle in window)
        spread = highest - lowest
        raw[index] = 50.0 if spread == 0 else 100.0 * (window[-1].close - lowest) / spread
    valid_raw = [item for item in raw if item is not None]
    k_line = sma(valid_raw, smooth_k)
    # %D is the SMA of *valid* smoothed %K values; the leading `None`s from
    # smoothing must not be fed back into the rolling window.
    valid_k = [item for item in k_line if item is not None]
    d_line = sma(valid_k, d_period)
    k_values: list[IndicatorValue] = [None] * len(candles)
    d_values: list[IndicatorValue] = [None] * len(candles)
    k_iterator = iter(k_line)
    d_iterator = iter(d_line)
    k_index = -1
    for index, item in enumerate(raw):
        if item is None:
            continue
        k_index += 1
        k_values[index] = next(k_iterator)
        if k_line[k_index] is not None:
            d_values[index] = next(d_iterator)
    return {'k': k_values, 'd': d_values}


def cci(candles: Sequence[Candle], period: int = 20) -> list[IndicatorValue]:
    """Commodity Channel Index using mean absolute deviation."""
    _require_period(period)
    typical = [(candle.high + candle.low + candle.close) / 3.0 for candle in candles]
    result: list[IndicatorValue] = [None] * len(candles)
    averages = sma(typical, period)
    for index in range(period - 1, len(candles)):
        average = float(averages[index])
        deviation = sum(abs(value - average) for value in typical[index - period + 1 : index + 1]) / period
        result[index] = 0.0 if deviation == 0 else (typical[index] - average) / (0.015 * deviation)
    return result


def roc(values: Sequence[float], period: int = 12) -> list[IndicatorValue]:
    """Rate of change in percent."""
    _require_period(period)
    result: list[IndicatorValue] = [None] * len(values)
    for index in range(period, len(values)):
        previous = values[index - period]
        result[index] = ((values[index] / previous) - 1.0) * 100.0 if previous else 0.0
    return result


def bollinger(
    values: Sequence[float], period: int = 20, deviations: float = 2.0
) -> dict[str, list[IndicatorValue]]:
    """Bollinger Bands (population standard deviation)."""
    _require_period(period)
    middle = sma(values, period)
    upper: list[IndicatorValue] = [None] * len(values)
    lower: list[IndicatorValue] = [None] * len(values)
    for index in range(period - 1, len(values)):
        window = values[index - period + 1 : index + 1]
        average = float(middle[index])
        variance = sum((value - average) ** 2 for value in window) / period
        spread = math.sqrt(variance) * deviations
        upper[index], lower[index] = average + spread, average - spread
    return {'upper': upper, 'middle': middle, 'lower': lower}


def historical_volatility(values: Sequence[float], timeframe: str) -> float:
    """Annualised realised volatility (%) from log returns."""
    bars = BARS_PER_YEAR.get(timeframe)
    if bars is None:
        raise ValueError(f'Unsupported timeframe: {timeframe}')
    returns = [
        math.log(values[index] / values[index - 1])
        for index in range(1, len(values))
        if values[index - 1] > 0 and values[index] > 0
    ]
    if len(returns) < 2:
        return 0.0
    mean = sum(returns) / len(returns)
    variance = sum((value - mean) ** 2 for value in returns) / (len(returns) - 1)
    return math.sqrt(variance) * 100.0 * math.sqrt(bars)


def swing_points(
    candles: Sequence[Candle], lookback: int = 2
) -> dict[str, list[dict[str, Any]]]:
    """Local swing highs/lows using ``lookback`` bars on each side."""
    if lookback < 1:
        raise ValueError('lookback must be >= 1')
    highs: list[dict[str, Any]] = []
    lows: list[dict[str, Any]] = []
    for index in range(lookback, len(candles) - lookback):
        left = candles[index - lookback : index]
        right = candles[index + 1 : index + lookback + 1]
        if candles[index].high > max(candle.high for candle in (*left, *right)):
            highs.append({'timestamp': candles[index].timestamp, 'value': candles[index].high})
        if candles[index].low < min(candle.low for candle in (*left, *right)):
            lows.append({'timestamp': candles[index].timestamp, 'value': candles[index].low})
    return {'swingHighs': highs, 'swingLows': lows}


def support_resistance(
    candles: Sequence[Candle], lookback: int = 2, tolerance_pct: float = 0.5
) -> dict[str, list[dict[str, Any]]]:
    """Cluster swing points into rounded support/resistance bands."""
    points = swing_points(candles, lookback)
    levels: dict[str, list[dict[str, Any]]] = {'support': [], 'resistance': []}
    for key, target in (('swingLows', 'support'), ('swingHighs', 'resistance')):
        clusters: list[dict[str, Any]] = []
        for point in points[key]:
            value = point['value']
            cluster = next(
                (
                    item
                    for item in clusters
                    if abs(value - item['value']) / max(abs(item['value']), 1e-12) * 100
                    <= tolerance_pct
                ),
                None,
            )
            if cluster is None:
                clusters.append({'value': value, 'touches': 1, 'firstAt': point['timestamp']})
                continue
            cluster['touches'] += 1
            cluster['value'] = (cluster['value'] * (cluster['touches'] - 1) + value) / cluster['touches']
        levels[target] = sorted(clusters, key=lambda item: (-item['touches'], item['firstAt']))[:5]
    return levels


def pivots(candle: Candle) -> dict[str, float]:
    """Classic and Fibonacci floor pivots for the latest bar."""
    high, low, close = candle.high, candle.low, candle.close
    base = (high + low + close) / 3.0
    spread = high - low
    return {
        'classic': {
            'P': base,
            'R1': 2 * base - low,
            'R2': base + spread,
            'R3': high + 2 * (base - low),
            'S1': 2 * base - high,
            'S2': base - spread,
            'S3': low - 2 * (high - base),
        },
        'fibonacci': {
            'P': base,
            'R1': base + 0.382 * spread,
            'R2': base + 0.618 * spread,
            'R3': base + spread,
            'S1': base - 0.382 * spread,
            'S2': base - 0.618 * spread,
            'S3': base - spread,
        },
    }


def obv(candles: Sequence[Candle]) -> list[IndicatorValue]:
    """On-Balance Volume (indicative without centralised forex volume)."""
    total = 0.0
    result: list[IndicatorValue] = []
    for index, candle in enumerate(candles):
        if index == 0:
            total = 0.0
        elif candle.close > candles[index - 1].close:
            total += candle.volume or 0.0
        elif candle.close < candles[index - 1].close:
            total -= candle.volume or 0.0
        result.append(total)
    return result


def vwap(candles: Sequence[Candle]) -> list[IndicatorValue]:
    """Cumulative volume-weighted average price (indicative without volume)."""
    cumulative_price = 0.0
    cumulative_volume = 0.0
    result: list[IndicatorValue] = []
    for candle in candles:
        typical = (candle.high + candle.low + candle.close) / 3.0
        volume = candle.volume if candle.volume is not None else 1.0
        cumulative_price += typical * volume
        cumulative_volume += volume
        result.append(cumulative_price / cumulative_volume if cumulative_volume else typical)
    return result


def _tail(series: Sequence[IndicatorValue]) -> list[IndicatorValue]:
    return [value for value in series[-SERIES_TAIL:]]


def _latest(series: Sequence[IndicatorValue]) -> IndicatorValue:
    return series[-1] if series else None


def compute_all(
    candles: Sequence[Candle],
    timeframe: str,
    names: Sequence[str] | None = None,
) -> dict[str, dict[str, Any]]:
    """Compute a bounded indicator snapshot.

    ``names`` accepts either canonical keys (``RSI14``) or their base names
    (``RSI``); when omitted every indicator is returned.
    """
    if not candles:
        raise ValueError('At least one candle is required')
    closes = [candle.close for candle in candles]
    line = macd(closes)
    direction = adx(candles)
    stoch = stochastic(candles)
    bands = bollinger(closes)
    all_values: dict[str, dict[str, Any]] = {
        'SMA20': {'value': _latest(sma(closes, 20)), 'series': _tail(sma(closes, 20))},
        'SMA50': {'value': _latest(sma(closes, 50)), 'series': _tail(sma(closes, 50))},
        'SMA100': {'value': _latest(sma(closes, 100)), 'series': _tail(sma(closes, 100))},
        'SMA200': {'value': _latest(sma(closes, 200)), 'series': _tail(sma(closes, 200))},
        'EMA20': {'value': _latest(ema(closes, 20)), 'series': _tail(ema(closes, 20))},
        'EMA50': {'value': _latest(ema(closes, 50)), 'series': _tail(ema(closes, 50))},
        'EMA200': {'value': _latest(ema(closes, 200)), 'series': _tail(ema(closes, 200))},
        'MACD': {
            'value': {
                'macd': _latest(line['macd']) or 0.0,
                'signal': _latest(line['signal']) or 0.0,
                'histogram': _latest(line['histogram']) or 0.0,
            },
            'series': _tail(line['histogram']),
        },
        'ADX14': {
            'value': {
                'adx': _latest(direction['adx']) or 0.0,
                'plusDi': _latest(direction['plusDi']) or 0.0,
                'minusDi': _latest(direction['minusDi']) or 0.0,
            },
            'series': _tail(direction['adx']),
        },
        'RSI14': {'value': _latest(rsi(closes)), 'series': _tail(rsi(closes))},
        'STOCH14': {
            'value': {'k': _latest(stoch['k']) or 0.0, 'd': _latest(stoch['d']) or 0.0},
            'series': _tail(stoch['k']),
        },
        'CCI20': {'value': _latest(cci(candles)), 'series': _tail(cci(candles))},
        'ROC12': {'value': _latest(roc(closes)), 'series': _tail(roc(closes))},
        'ATR14': {'value': _latest(atr(candles)), 'series': _tail(atr(candles))},
        'BB20': {
            'value': {
                'upper': _latest(bands['upper']) or 0.0,
                'middle': _latest(bands['middle']) or 0.0,
                'lower': _latest(bands['lower']) or 0.0,
            },
            'series': _tail(bands['middle']),
        },
        'HV': {'value': historical_volatility(closes, timeframe), 'series': []},
        'SWING': {'value': swing_points(candles), 'series': []},
        'LEVELS': {'value': support_resistance(candles), 'series': []},
        'PIVOTS': {'value': pivots(candles[-1]), 'series': []},
        'OBV': {
            'value': _latest(obv(candles)) or 0.0,
            'series': _tail(obv(candles)),
            'indicative': True,
        },
        'VWAP': {
            'value': _latest(vwap(candles)) or 0.0,
            'series': _tail(vwap(candles)),
            'indicative': any(candle.volume is None for candle in candles),
        },
    }
    if names is None:
        return all_values
    requested = {name.upper() for name in names}
    return {
        key: value
        for key, value in all_values.items()
        if key in requested or key.rstrip('0123456789') in requested
    }
