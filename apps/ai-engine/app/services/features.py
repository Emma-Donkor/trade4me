"""Leakage-free feature vectors — the PHASE 12 contract between data and ML.

The Python engine is the single math authority. Callers pass bounded, already
fetched inputs; every timestamp is filtered against ``as_of`` before any value
is computed. Nothing in this module reads a database, cache or clock.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone, UTC
from typing import Any, Mapping, Sequence

from ..config import settings
from .feature_manifest import (
    FEATURE_BY_NAME,
    FEATURE_NAMES,
    MANIFEST_CHECKSUM,
    assert_compatible,
    validate_vector,
)
from .indicators import (
    BARS_PER_YEAR,
    Candle,
    adx,
    atr,
    bollinger,
    ema,
    historical_volatility,
    macd,
    parse_candles,
    rsi,
    support_resistance,
)
from .regime import classify

MIN_BARS = 200
MAX_CANDLES = 500
MAX_VECTORS = 500
NEWS_LOOKBACK_HOURS = 72
CROSS_BARS = 24
ATR_WARMUP_BARS = 14
ATR_PERCENTILE_WINDOW = 100
NO_EVENT_MINUTES = 30 * 24 * 60

REGIME_LABELS = (
    "STRONG_UPTREND",
    "WEAK_UPTREND",
    "RANGE",
    "WEAK_DOWNTREND",
    "STRONG_DOWNTREND",
    "HIGH_VOLATILITY",
    "LOW_VOLATILITY",
    "UNCERTAIN",
)
IMPACT_WEIGHT = {"LOW": 1.0, "MEDIUM": 2.0, "HIGH": 4.0, "EXTREME": 8.0}
SENTIMENT_SIGN = {"BULLISH": 1.0, "BEARISH": -1.0, "NEUTRAL": 0.0}

IMPUTE_VALUE: dict[str, float] = {
    "distance_to_support_atr": 0.0,
    "distance_to_resistance_atr": 0.0,
    "news_sentiment": 50.0,
    "news_impact": 0.0,
    "minutes_to_high_event": float(NO_EVENT_MINUTES),
    "currency_strength_index": 0.0,
    "correlation_vs_majors": 0.0,
}
IMPUTE_FLAG: dict[str, str] = {
    "distance_to_support_atr": "levels_missing",
    "distance_to_resistance_atr": "levels_missing",
    "news_sentiment": "news_missing",
    "news_impact": "news_missing",
    "minutes_to_high_event": "events_missing",
    "currency_strength_index": "cross_missing",
    "correlation_vs_majors": "cross_missing",
}
FLAG_NAMES = tuple(name for name in FEATURE_NAMES if name.endswith("_missing"))


class InsufficientDataError(ValueError):
    """Raised when a required feature cannot be computed from the given inputs."""

    def __init__(self, missing: Sequence[str], message: str = "Insufficient data for features") -> None:
        self.missing = tuple(dict.fromkeys(missing))
        detail = ", ".join(self.missing) if self.missing else "required inputs"
        super().__init__(f"{message}: {detail}")


def parse_timestamp(value: Any) -> datetime:
    """Parse an ISO-8601 timestamp into an aware UTC datetime."""
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value)
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def format_timestamp(value: datetime) -> str:
    """Canonical UTC representation used in persisted vectors and responses."""
    return parse_timestamp(value).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _as_mapping(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return dict(value.model_dump())
    if isinstance(value, Mapping):
        return dict(value)
    raise ValueError(f"Expected a mapping-like feature input, got {type(value).__name__}")


def _latest(series: Sequence[Any]) -> Any:
    return series[-1] if series else None


def _percentile(values: Sequence[float], value: float) -> float:
    if not values:
        return 50.0
    below = sum(1 for item in values if item < value)
    equal = sum(1 for item in values if item == value)
    return (below + 0.5 * equal) / len(values) * 100.0


def _pearson(left: Sequence[float], right: Sequence[float]) -> float | None:
    if len(left) != len(right) or len(left) < 3:
        return None
    mean_left = sum(left) / len(left)
    mean_right = sum(right) / len(right)
    covariance = sum((a - mean_left) * (b - mean_right) for a, b in zip(left, right))
    spread_left = sum((a - mean_left) ** 2 for a in left)
    spread_right = sum((b - mean_right) ** 2 for b in right)
    if spread_left <= 0 or spread_right <= 0:
        return None
    return covariance / math.sqrt(spread_left * spread_right)


def _symbol_parts(symbol: str) -> tuple[str, str]:
    parts = symbol.upper().split("/")
    if len(parts) != 2:
        return parts[0] if parts else "", ""
    return parts[0], parts[1]


def _utc_session(hour: int) -> str:
    if 8 <= hour < 12:
        return "london"
    if 12 <= hour < 16:
        return "overlap"
    if 16 <= hour < 20:
        return "new_york"
    return "asia"


def _log_return(current: float, previous: float) -> float | None:
    if previous <= 0 or current <= 0:
        return None
    return math.log(current / previous) * 100.0


def _filtered_candles(candles: Sequence[Candle], as_of: datetime) -> list[Candle]:
    return [candle for candle in candles if parse_timestamp(candle.timestamp) <= as_of]


def _prepare_candles(rows: Sequence[Any]) -> list[Candle]:
    return parse_candles([_as_mapping(row) for row in rows])


def _prepare_peer_candles(peers: Mapping[str, Sequence[Any]] | None) -> dict[str, list[Candle]]:
    if not peers:
        return {}
    return {str(symbol): _prepare_candles(rows) for symbol, rows in peers.items()}


def _news_is_relevant(row: Mapping[str, Any], symbol: str, base: str, quote: str) -> bool:
    affected = {str(item).upper() for item in row.get("affectedPairs", []) or []}
    currencies = {str(item).upper() for item in row.get("currencies", []) or []}
    return symbol.upper() in affected or base in currencies or quote in currencies


def _news_values(
    news: Sequence[Mapping[str, Any]], as_of: datetime, symbol: str, base: str, quote: str
) -> tuple[float | None, float | None]:
    cutoff = as_of - timedelta(hours=NEWS_LOOKBACK_HOURS)
    weighted: list[tuple[float, float, float]] = []
    for row in news:
        try:
            published = parse_timestamp(row.get("publishedAt", ""))
        except (TypeError, ValueError):
            continue
        if published > as_of or published < cutoff:
            continue
        if not _news_is_relevant(row, symbol, base, quote):
            continue
        sentiment = str(row.get("sentiment", "NEUTRAL")).upper()
        impact = str(row.get("impact", "LOW")).upper()
        impact_weight = IMPACT_WEIGHT.get(impact, 1.0)
        age_hours = (as_of - published).total_seconds() / 3600.0
        recency = max(0.05, 1.0 - age_hours / NEWS_LOOKBACK_HOURS)
        weight = impact_weight * recency
        weighted.append((SENTIMENT_SIGN.get(sentiment, 0.0), weight, impact_weight))

    if not weighted:
        return None, None
    total = sum(weight for _, weight, _ in weighted)
    signed = sum(sign * weight for sign, weight, _ in weighted)
    score = min(100.0, max(0.0, 50.0 + 50.0 * signed / total))
    return score, max(impact for _, _, impact in weighted)


def _minutes_to_event(
    events: Sequence[Mapping[str, Any]], as_of: datetime, base: str, quote: str
) -> float | None:
    minutes: list[float] = []
    for row in events:
        try:
            scheduled = parse_timestamp(row.get("scheduledAt", ""))
        except (TypeError, ValueError):
            continue
        if scheduled <= as_of:
            continue
        currency = str(row.get("currency", "")).upper()
        if currency and currency not in {base, quote}:
            continue
        if str(row.get("impact", "")).upper() not in {"HIGH", "EXTREME"}:
            continue
        minutes.append((scheduled - as_of).total_seconds() / 60.0)
    return min(minutes) if minutes else None


def _peer_return(candles: Sequence[Candle], as_of: datetime) -> float | None:
    window = _filtered_candles(candles, as_of)
    if len(window) <= CROSS_BARS or window[-1 - CROSS_BARS].close <= 0:
        return None
    return (window[-1].close / window[-1 - CROSS_BARS].close - 1.0) * 10_000.0


def _cross_values(
    symbol: str,
    target: Sequence[Candle],
    peers: Mapping[str, Sequence[Candle]],
    as_of: datetime,
) -> tuple[float | None, float | None]:
    returns: dict[str, float] = {}
    for peer_symbol, candles in peers.items():
        if peer_symbol.upper() == symbol.upper():
            continue
        value = _peer_return(candles, as_of)
        if value is not None:
            returns[peer_symbol] = value

    base, quote = _symbol_parts(symbol)

    def strength(currency: str) -> float | None:
        as_base = [value for peer, value in returns.items() if _symbol_parts(peer)[0] == currency]
        as_quote = [value for peer, value in returns.items() if _symbol_parts(peer)[1] == currency]
        if not as_base and not as_quote:
            return None
        base_mean = sum(as_base) / len(as_base) if as_base else 0.0
        quote_mean = sum(as_quote) / len(as_quote) if as_quote else 0.0
        return base_mean - quote_mean

    base_strength, quote_strength = strength(base), strength(quote)
    csi = None
    if base_strength is not None and quote_strength is not None:
        csi = base_strength - quote_strength

    target_returns: list[tuple[str, float]] = []
    for index in range(len(target) - CROSS_BARS, len(target)):
        value = _log_return(target[index].close, target[index - 1].close)
        if value is not None:
            target_returns.append((target[index].timestamp, value))

    correlations: list[float] = []
    for peer_symbol, candles in peers.items():
        if peer_symbol.upper() == symbol.upper():
            continue
        window = _filtered_candles(candles, as_of)
        if len(window) <= CROSS_BARS:
            continue
        by_timestamp: dict[str, float] = {}
        for index in range(len(window) - CROSS_BARS, len(window)):
            value = _log_return(window[index].close, window[index - 1].close)
            if value is not None:
                by_timestamp[window[index].timestamp] = value
        aligned = [(value, by_timestamp[ts]) for ts, value in target_returns if ts in by_timestamp]
        correlation = _pearson(
            [item[0] for item in aligned],
            [item[1] for item in aligned],
        )
        if correlation is not None:
            correlations.append(correlation)
    correlation_value = sum(correlations) / len(correlations) if correlations else None
    return csi, correlation_value


def _build_prepared(
    *,
    symbol: str,
    timeframe: str,
    as_of: datetime,
    candles: Sequence[Candle],
    peers: Mapping[str, Sequence[Candle]],
    news: Sequence[Mapping[str, Any]],
    events: Sequence[Mapping[str, Any]],
    regime: Mapping[str, Any] | None,
    compute_regime: bool,
    version: str,
) -> dict[str, float]:
    assert_compatible(version)
    window = _filtered_candles(candles, as_of)
    if len(window) < MIN_BARS:
        raise InsufficientDataError([f"candles>={MIN_BARS}"], "Insufficient candle history")

    closes = [candle.close for candle in window]
    latest = closes[-1]
    atr_series = atr(window)
    atr_value = _latest(atr_series)
    if atr_value is None or atr_value <= 0:
        raise InsufficientDataError(["atr_pct"], "ATR is zero or unavailable")
    atr_price = float(atr_value)

    rsi_value = _latest(rsi(closes))
    macd_series = macd(closes)
    macd_line = _latest(macd_series["macd"])
    macd_signal = _latest(macd_series["signal"])
    macd_histogram = _latest(macd_series["histogram"])
    ema20 = _latest(ema(closes, 20))
    ema50 = _latest(ema(closes, 50))
    ema200 = _latest(ema(closes, 200))
    directional = adx(window)
    adx_value = _latest(directional["adx"])
    bands = bollinger(closes)
    upper, middle, lower = _latest(bands["upper"]), _latest(bands["middle"]), _latest(bands["lower"])

    required_raw: dict[str, float | None] = {
        "rsi14": rsi_value,
        "macd_line_atr": macd_line / atr_price if macd_line is not None else None,
        "macd_signal_atr": macd_signal / atr_price if macd_signal is not None else None,
        "macd_hist_atr": macd_histogram / atr_price if macd_histogram is not None else None,
        "ema20_distance_pct": (latest / float(ema20) - 1.0) * 100.0 if ema20 else None,
        "ema50_distance_pct": (latest / float(ema50) - 1.0) * 100.0 if ema50 else None,
        "ema200_distance_pct": (latest / float(ema200) - 1.0) * 100.0 if ema200 else None,
        "adx14": adx_value,
        "bollinger_width_pct": (
            (float(upper) - float(lower)) / float(middle) * 100.0
            if middle and upper is not None and lower is not None
            else None
        ),
        "atr_pct": atr_price / latest * 100.0 if latest > 0 else None,
        "return_1": _log_return(closes[-1], closes[-2]),
        "return_4": _log_return(closes[-1], closes[-5]),
        "return_12": _log_return(closes[-1], closes[-13]),
        "return_24": _log_return(closes[-1], closes[-25]),
        "realized_vol_pct": historical_volatility(closes[-25:], timeframe),
        "atr_percentile": None,
        "time_of_day_utc": (as_of.hour * 60 + as_of.minute) / 1440.0,
        "day_of_week": (as_of.weekday() + 1) / 7.0,
    }

    atr_percent_series = [
        float(value) / window[index].close * 100.0
        for index, value in enumerate(atr_series)
        if value is not None and window[index].close > 0
    ]
    mature_atr = atr_percent_series[ATR_WARMUP_BARS:]
    atr_window = mature_atr[-ATR_PERCENTILE_WINDOW:]
    if atr_window:
        required_raw["atr_percentile"] = _percentile(atr_window, atr_window[-1])

    parkinson_window = window[-25:]
    squared_log_ranges = []
    for candle in parkinson_window:
        if candle.low > 0 and candle.high >= candle.low:
            squared_log_ranges.append(math.log(candle.high / candle.low) ** 2)
    if squared_log_ranges:
        bars_per_year = BARS_PER_YEAR.get(timeframe)
        if bars_per_year is None:
            raise InsufficientDataError([f"timeframe:{timeframe}"], "Unsupported timeframe")
        mean_squared = sum(squared_log_ranges) / len(squared_log_ranges)
        required_raw["parkinson_vol_pct"] = (
            math.sqrt(mean_squared / (4.0 * math.log(2.0))) * 100.0 * math.sqrt(bars_per_year)
        )
    else:
        required_raw["parkinson_vol_pct"] = None

    session = _utc_session(as_of.hour)
    for name in ("asia", "london", "overlap", "new_york"):
        required_raw[f"session_{name}"] = 1.0 if session == name else 0.0
    weekday = as_of.weekday()
    for index, day in enumerate(("mon", "tue", "wed", "thu", "fri", "sat", "sun")):
        required_raw[f"dow_{day}"] = 1.0 if weekday == index else 0.0

    levels = support_resistance(window)
    support = [float(level["value"]) for level in levels["support"] if level["value"] <= latest]
    resistance = [float(level["value"]) for level in levels["resistance"] if level["value"] >= latest]
    optional_raw: dict[str, float | None] = {
        "distance_to_support_atr": (latest - max(support)) / atr_price if support else None,
        "distance_to_resistance_atr": (min(resistance) - latest) / atr_price if resistance else None,
    }

    regime_label: str | None = None
    if regime is not None:
        candidate = str(regime.get("regime", "")).upper()
        regime_label = candidate if candidate in REGIME_LABELS else None
    elif compute_regime:
        regime_label = str(classify(window)["regime"]).upper()
    for label in REGIME_LABELS:
        optional_raw[f"regime_{label}"] = 1.0 if regime_label == label else None if regime_label is None else 0.0

    base, quote = _symbol_parts(symbol)
    news_sentiment, news_impact = _news_values(news, as_of, symbol, base, quote)
    optional_raw["news_sentiment"] = news_sentiment
    optional_raw["news_impact"] = news_impact
    optional_raw["minutes_to_high_event"] = _minutes_to_event(events, as_of, base, quote)
    csi, correlation = _cross_values(symbol, window, peers, as_of)
    optional_raw["currency_strength_index"] = csi
    optional_raw["correlation_vs_majors"] = correlation

    raw: dict[str, float | None] = {**required_raw, **optional_raw}
    flags: dict[str, float] = {name: 0.0 for name in FLAG_NAMES}
    missing_required: list[str] = []
    for name in FEATURE_NAMES:
        if name.endswith("_missing"):
            continue
        value = raw.get(name)
        if value is None:
            definition = FEATURE_BY_NAME[name]
            if definition.required:
                missing_required.append(name)
                continue
            if name.startswith("regime_"):
                raw[name] = 1.0 if name == "regime_UNCERTAIN" else 0.0
                flags["regime_missing"] = 1.0
                continue
            raw[name] = IMPUTE_VALUE[name]
            flags[IMPUTE_FLAG[name]] = 1.0
        elif not math.isfinite(float(value)):
            missing_required.append(name)

    if missing_required:
        raise InsufficientDataError(missing_required)
    for name in FLAG_NAMES:
        raw[name] = flags[name]
    return validate_vector(raw, version=version)


def build_feature_vector(
    *,
    symbol: str,
    timeframe: str,
    as_of: str | datetime,
    candles: Sequence[Any],
    peer_candles: Mapping[str, Sequence[Any]] | None = None,
    news: Sequence[Any] | None = None,
    events: Sequence[Any] | None = None,
    regime: Mapping[str, Any] | None = None,
    compute_regime: bool = False,
    feature_version: str | None = None,
) -> dict[str, float]:
    """Build one leakage-free vector using only inputs at or before ``as_of``."""
    version = feature_version or settings.FEATURE_VERSION
    parsed_candles = _prepare_candles(candles)
    parsed_peers = _prepare_peer_candles(peer_candles)
    parsed_news = [_as_mapping(row) for row in (news or [])]
    parsed_events = [_as_mapping(row) for row in (events or [])]
    parsed_regime = _as_mapping(regime) if regime is not None else None
    return _build_prepared(
        symbol=symbol,
        timeframe=timeframe,
        as_of=parse_timestamp(as_of),
        candles=parsed_candles,
        peers=parsed_peers,
        news=parsed_news,
        events=parsed_events,
        regime=parsed_regime,
        compute_regime=compute_regime,
        version=version,
    )


def build_rolling_vectors(
    *,
    symbol: str,
    timeframe: str,
    as_of: str | datetime,
    candles: Sequence[Any],
    timestamps: Sequence[str | datetime],
    peer_candles: Mapping[str, Sequence[Any]] | None = None,
    news: Sequence[Any] | None = None,
    events: Sequence[Any] | None = None,
    regimes: Mapping[str, Mapping[str, Any]] | None = None,
    compute_regime: bool = True,
    feature_version: str | None = None,
) -> list[dict[str, Any]]:
    """Build bounded rolling vectors; each timestamp is its own strict cutoff."""
    version = feature_version or settings.FEATURE_VERSION
    assert_compatible(version)
    if not timestamps:
        raise InsufficientDataError(["timestamps"], "No feature timestamps requested")
    if len(timestamps) > MAX_VECTORS:
        raise InsufficientDataError([f"timestamps<={MAX_VECTORS}"], "Too many feature timestamps")
    if len(candles) > MAX_CANDLES:
        raise InsufficientDataError([f"candles<={MAX_CANDLES}"], "Candle window exceeds bound")

    parsed_candles = _prepare_candles(candles)
    parsed_peers = _prepare_peer_candles(peer_candles)
    parsed_news = [_as_mapping(row) for row in (news or [])]
    parsed_events = [_as_mapping(row) for row in (events or [])]
    latest_as_of = parse_timestamp(as_of)
    ordered = sorted({parse_timestamp(value) for value in timestamps})
    if any(value > latest_as_of for value in ordered):
        raise InsufficientDataError(["timestamps<=as_of"], "Feature timestamp is after as_of")

    vectors: list[dict[str, Any]] = []
    for value in ordered:
        regime = None
        if regimes:
            candidate = regimes.get(format_timestamp(value))
            if candidate is None:
                candidate = next(
                    (
                        item
                        for key, item in regimes.items()
                        if parse_timestamp(key) == value
                    ),
                    None,
                )
            regime = _as_mapping(candidate) if candidate is not None else None
        features = _build_prepared(
            symbol=symbol,
            timeframe=timeframe,
            as_of=value,
            candles=parsed_candles,
            peers=parsed_peers,
            news=parsed_news,
            events=parsed_events,
            regime=regime,
            compute_regime=compute_regime,
            version=version,
        )
        vectors.append({"timestamp": format_timestamp(value), "features": features})
    return vectors


__all__ = [
    "FLAG_NAMES",
    "InsufficientDataError",
    "MANIFEST_CHECKSUM",
    "MAX_CANDLES",
    "MAX_VECTORS",
    "MIN_BARS",
    "build_feature_vector",
    "build_rolling_vectors",
]
