"""Versioned feature manifest for the PHASE 12 contract between data and ML.

The committed JSON file is the audited contract. Its checksum covers the feature
version and every declared name/type/source/window/required/missingPolicy tuple.
A feature added to the builder but not to the manifest (or vice versa) fails at
import/validation time, which forces an explicit ``FEATURE_VERSION`` bump.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

MANIFEST_VERSION = "v1.0"
MANIFEST_FILENAME = "feature_manifest_v1.json"
MANIFEST_PATH = Path(__file__).with_name(MANIFEST_FILENAME)

TECHNICAL = "technical"
MOMENTUM = "momentum"
VOLATILITY = "volatility"
LEVELS = "levels"
REGIME = "regime"
NEWS = "news"
EVENTS = "economic-events"
CROSS = "cross"
TIME = "time"
IMPUTED = "imputed"


class FeatureManifestError(RuntimeError):
    """Raised when the committed manifest and the implementation disagree."""


@dataclass(frozen=True)
class FeatureDefinition:
    name: str
    type: str
    source: str
    window: str
    required: bool
    missingPolicy: str


REQUIRED_POLICY = "required — absent value raises INSUFFICIENT_DATA"


def _definition(
    name: str, source: str, window: str, *, required: bool = True, missingPolicy: str = REQUIRED_POLICY
) -> FeatureDefinition:
    return FeatureDefinition(name, "float", source, window, required, missingPolicy)


FEATURE_DEFINITIONS: tuple[FeatureDefinition, ...] = (
    # Technical (PHASE 10 math authority)
    _definition("rsi14", TECHNICAL, "14 bars"),
    _definition("macd_line_atr", TECHNICAL, "26 bars; ATR14-normalised"),
    _definition("macd_signal_atr", TECHNICAL, "35 bars; ATR14-normalised"),
    _definition("macd_hist_atr", TECHNICAL, "35 bars; ATR14-normalised"),
    _definition("ema20_distance_pct", TECHNICAL, "20 bars"),
    _definition("ema50_distance_pct", TECHNICAL, "50 bars"),
    _definition("ema200_distance_pct", TECHNICAL, "200 bars"),
    _definition("adx14", TECHNICAL, "28 bars"),
    _definition("bollinger_width_pct", TECHNICAL, "20 bars"),
    _definition("atr_pct", TECHNICAL, "14 bars"),
    # Momentum and volatility
    _definition("return_1", MOMENTUM, "1 bar"),
    _definition("return_4", MOMENTUM, "4 bars"),
    _definition("return_12", MOMENTUM, "12 bars"),
    _definition("return_24", MOMENTUM, "24 bars"),
    _definition("realized_vol_pct", VOLATILITY, "24 bars, annualised"),
    _definition("parkinson_vol_pct", VOLATILITY, "24 bars, annualised"),
    _definition("atr_percentile", VOLATILITY, "100 mature ATR14% observations"),
    # Support/resistance levels
    _definition(
        "distance_to_support_atr",
        LEVELS,
        "200 bars",
        required=False,
        missingPolicy="NaN -> 0.0 with levels_missing=1",
    ),
    _definition(
        "distance_to_resistance_atr",
        LEVELS,
        "200 bars",
        required=False,
        missingPolicy="NaN -> 0.0 with levels_missing=1",
    ),
    # Regime one-hot (PHASE 10 classifier)
    *(
        _definition(
            f"regime_{label}",
            REGIME,
            "200 bars",
            required=False,
            missingPolicy="NaN -> UNCERTAIN=1.0 with regime_missing=1",
        )
        for label in (
            "STRONG_UPTREND",
            "WEAK_UPTREND",
            "RANGE",
            "WEAK_DOWNTREND",
            "STRONG_DOWNTREND",
            "HIGH_VOLATILITY",
            "LOW_VOLATILITY",
            "UNCERTAIN",
        )
    ),
    # News and calendar (PHASE 11 inputs)
    _definition(
        "news_sentiment",
        NEWS,
        "72 hours, publishedAt <= as_of",
        required=False,
        missingPolicy="NaN -> neutral 50.0 with news_missing=1",
    ),
    _definition(
        "news_impact",
        NEWS,
        "72 hours, publishedAt <= as_of",
        required=False,
        missingPolicy="NaN -> 0.0 with news_missing=1",
    ),
    _definition(
        "minutes_to_high_event",
        EVENTS,
        "next HIGH/EXTREME event with scheduledAt > as_of",
        required=False,
        missingPolicy="NaN -> 43200.0 (30 days) with events_missing=1",
    ),
    # Cross-market and calendar time
    _definition(
        "currency_strength_index",
        CROSS,
        "24 bars vs major-pair basket",
        required=False,
        missingPolicy="NaN -> 0.0 with cross_missing=1",
    ),
    _definition(
        "correlation_vs_majors",
        CROSS,
        "24 aligned log returns vs major pairs",
        required=False,
        missingPolicy="NaN -> 0.0 with cross_missing=1",
    ),
    _definition("time_of_day_utc", TIME, "as_of instant (UTC day fraction)"),
    _definition("day_of_week", TIME, "as_of instant (Monday=1..Sunday=7, /7)"),
    *(
        _definition(f"session_{session}", TIME, "as_of instant (UTC)")
        for session in ("asia", "london", "overlap", "new_york")
    ),
    *(
        _definition(f"dow_{day}", TIME, "as_of instant (UTC)")
        for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
    ),
    # Missing-input flags are features so models can distinguish imputation.
    *(
        _definition(
            f"{family}_missing",
            IMPUTED,
            "as_of instant",
            required=False,
            missingPolicy="1.0 when the parent family was imputed, else 0.0",
        )
        for family in ("levels", "news", "events", "regime", "cross")
    ),
)

FEATURE_NAMES: tuple[str, ...] = tuple(item.name for item in FEATURE_DEFINITIONS)
REQUIRED_FEATURES: tuple[str, ...] = tuple(
    item.name for item in FEATURE_DEFINITIONS if item.required
)
FEATURE_BY_NAME: dict[str, FeatureDefinition] = {item.name: item for item in FEATURE_DEFINITIONS}

if len(FEATURE_BY_NAME) != len(FEATURE_DEFINITIONS):
    raise FeatureManifestError("Feature manifest contains duplicate names")


def canonical_payload(
    *, version: str = MANIFEST_VERSION, definitions: Sequence[FeatureDefinition] = FEATURE_DEFINITIONS
) -> dict[str, Any]:
    """Return the checksummed portion of a manifest (no checksum field)."""
    return {
        "featureVersion": version,
        "features": [asdict(item) for item in definitions],
    }


def checksum_for(payload: Mapping[str, Any]) -> str:
    """Stable SHA-256 over the canonical JSON representation."""
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def write_manifest(path: Path = MANIFEST_PATH) -> dict[str, Any]:
    """Regenerate the committed manifest with its checksum (developer tool)."""
    payload = canonical_payload()
    payload["checksum"] = checksum_for(payload)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


def load_manifest(path: Path = MANIFEST_PATH) -> dict[str, Any]:
    """Load and verify the committed manifest; never trust a stale checksum."""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise FeatureManifestError(f"Cannot read feature manifest: {exc}") from exc

    stored = payload.pop("checksum", None)
    actual = checksum_for(payload)
    if stored != actual:
        raise FeatureManifestError(
            f"Feature manifest checksum mismatch: committed={stored!r} computed={actual!r}"
        )
    names = tuple(item["name"] for item in payload.get("features", []))
    if names != FEATURE_NAMES:
        raise FeatureManifestError(
            "Feature manifest names differ from the implementation; bump FEATURE_VERSION"
        )
    payload["checksum"] = stored
    return payload


# The generator creates the committed file on first use; every normal import
# afterwards verifies it immediately.
MANIFEST = load_manifest() if MANIFEST_PATH.exists() else {}
MANIFEST_CHECKSUM = checksum_for(canonical_payload())


def assert_compatible(version: str, names: Sequence[str] | None = None) -> None:
    """Enforce the version+shape contract before any vector is persisted."""
    if version != MANIFEST["featureVersion"]:
        raise FeatureManifestError(
            f"FEATURE_VERSION {version!r} does not match manifest {MANIFEST['featureVersion']!r}"
        )
    if names is not None and tuple(sorted(names)) != tuple(sorted(FEATURE_NAMES)):
        missing = sorted(set(FEATURE_NAMES) - set(names))
        extra = sorted(set(names) - set(FEATURE_NAMES))
        raise FeatureManifestError(
            f"Feature vector shape drift; missing={missing}, extra={extra}. Bump FEATURE_VERSION"
        )


def validate_vector(vector: Mapping[str, Any], *, version: str) -> dict[str, float]:
    """Return a manifest-ordered, finite float vector or fail loudly."""
    assert_compatible(version, tuple(vector))
    result: dict[str, float] = {}
    for name in FEATURE_NAMES:
        value = vector[name]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise FeatureManifestError(f"Feature {name} is not numeric: {value!r}")
        number = float(value)
        if not math.isfinite(number):
            raise FeatureManifestError(f"Feature {name} is not finite: {value!r}")
        result[name] = number
    return result


if __name__ == "__main__":  # pragma: no cover - developer regeneration entry point
    generated = write_manifest()
    print(f"wrote {MANIFEST_PATH} checksum={generated['checksum']}")
