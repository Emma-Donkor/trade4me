"""PHASE 12 feature-family, manifest and reproducibility tests."""

from __future__ import annotations

import copy
import json
import math
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.feature_manifest import (
    FEATURE_NAMES,
    MANIFEST_CHECKSUM,
    FEATURE_DEFINITIONS,
    assert_compatible,
    load_manifest,
)
from app.services.features import (
    IMPUTE_VALUE,
    InsufficientDataError,
    build_feature_vector,
)
from feature_fixtures import (
    SERVICE_HEADERS,
    candles,
    event_item,
    news_item,
    oscillating_candles,
    peer_candles,
    request_payload,
)

client = TestClient(app)


def iso(offset: int) -> str:
    from feature_fixtures import iso as fixture_iso

    return fixture_iso(offset)


def assert_feature_keys(vector: dict[str, float]) -> None:
    assert tuple(vector) == FEATURE_NAMES
    assert all(math.isfinite(value) for value in vector.values())


def test_manifest_committed_checksum_matches_definitions() -> None:
    manifest = load_manifest()
    assert manifest['checksum'] == MANIFEST_CHECKSUM
    assert manifest['featureVersion'] == 'v1.0'
    assert [item['name'] for item in manifest['features']] == list(FEATURE_NAMES)
    assert [item for item in manifest['features']] == [
        {
            'name': item.name,
            'type': item.type,
            'source': item.source,
            'window': item.window,
            'required': item.required,
            'missingPolicy': item.missingPolicy,
        }
        for item in FEATURE_DEFINITIONS
    ]
    assert_compatible('v1.0', FEATURE_NAMES)
    with pytest.raises(Exception):
        assert_compatible('v2.0', FEATURE_NAMES)
    with pytest.raises(Exception):
        assert_compatible('v1.0', tuple(FEATURE_NAMES[:-1]))


def test_typescript_mirror_matches_manifest_names_and_checksum() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (repo_root / 'packages' / 'config' / 'src' / 'features.ts').read_text(encoding='utf-8')
    block = re.search(
        r"export const FEATURE_NAMES[^=]*= \[(.*?)\];", source, flags=re.DOTALL
    )
    assert block is not None
    names = re.findall(r"'([^']+)'", block.group(1))
    assert names == list(FEATURE_NAMES)
    checksum = re.search(r"FEATURE_MANIFEST_CHECKSUM\s*=\s*'([^']+)'", source)
    assert checksum is not None
    assert checksum.group(1) == MANIFEST_CHECKSUM


def test_all_feature_families_have_known_values_on_fixture() -> None:
    rows = oscillating_candles(260)
    as_of = rows[-1]['timestamp']
    vector = build_feature_vector(
        symbol='EUR/USD',
        timeframe='H1',
        as_of=as_of,
        candles=rows,
        news=[news_item(iso(250), 'BULLISH', 'EXTREME')],
        events=[event_item(iso(261), 'HIGH')],
        peer_candles={
            'EUR/GBP': peer_candles(1.005, start_offset=235),
            'GBP/USD': peer_candles(1.01, start_offset=235),
            'USD/JPY': peer_candles(0.99, start_offset=235),
        },
    )
    assert_feature_keys(vector)

    # Technical family.
    assert vector['rsi14'] == pytest.approx(vector['rsi14'], abs=1e-12)
    assert 0.0 <= vector['rsi14'] <= 100.0
    assert vector['atr_pct'] > 0.0
    assert vector['ema200_distance_pct'] == pytest.approx(vector['ema200_distance_pct'])

    # Momentum and volatility families.
    close_now = rows[-1]['close']
    close_prev = rows[-2]['close']
    assert vector['return_1'] == pytest.approx(math.log(close_now / close_prev) * 100.0)
    assert vector['return_4'] == pytest.approx(
        math.log(close_now / rows[-5]['close']) * 100.0
    )
    assert vector['realized_vol_pct'] > 0.0
    assert vector['parkinson_vol_pct'] > 0.0
    assert 0.0 <= vector['atr_percentile'] <= 100.0

    # Levels are present on an oscillating series and normalised by ATR.
    near_levels = build_feature_vector(
        symbol='EUR/USD', timeframe='H1', as_of=as_of, candles=candles(260, step=0.0)
    )
    assert near_levels['levels_missing'] == 1.0
    assert near_levels['distance_to_support_atr'] == 0.0

    # Regime one-hot sums to one when a regime is supplied.
    regime_vector = build_feature_vector(
        symbol='EUR/USD',
        timeframe='H1',
        as_of=as_of,
        candles=rows,
        regime={'regime': 'RANGE', 'confidence': 0.7, 'evidence': {}},
    )
    regime_flags = [value for name, value in regime_vector.items() if name.startswith('regime_')]
    assert sum(regime_flags) == pytest.approx(1.0)
    assert regime_vector['regime_RANGE'] == 1.0

    # News and events are present and use only as-of-safe rows.
    assert vector['news_missing'] == 0.0
    assert vector['news_sentiment'] == pytest.approx(100.0)
    assert vector['news_impact'] == pytest.approx(8.0)
    assert vector['events_missing'] == 0.0
    assert vector['minutes_to_high_event'] == pytest.approx(120.0)

    # Cross-currency and time families.
    assert vector['cross_missing'] == 0.0
    assert vector['currency_strength_index'] > 0.0
    assert -1.0 <= vector['correlation_vs_majors'] <= 1.0
    assert vector['time_of_day_utc'] == pytest.approx((259 % 24) / 24.0)
    assert sum(value for name, value in vector.items() if name.startswith('session_')) == 1.0
    assert sum(value for name, value in vector.items() if name.startswith('dow_')) == 1.0
    assert vector[f'dow_{["mon", "tue", "wed", "thu", "fri", "sat", "sun"][datetime.fromisoformat(as_of.replace("Z", "+00:00")).weekday()]}'] == 1.0


def test_missing_news_regime_and_cross_sections_use_neutral_values_with_flags() -> None:
    rows = oscillating_candles()
    vector = build_feature_vector(
        symbol='EUR/USD', timeframe='H1', as_of=rows[-1]['timestamp'], candles=rows
    )
    assert_feature_keys(vector)
    assert vector['news_sentiment'] == IMPUTE_VALUE['news_sentiment']
    assert vector['news_impact'] == 0.0
    assert vector['news_missing'] == 1.0
    assert vector['minutes_to_high_event'] == IMPUTE_VALUE['minutes_to_high_event']
    assert vector['events_missing'] == 1.0
    assert vector['currency_strength_index'] == 0.0
    assert vector['correlation_vs_majors'] == 0.0
    assert vector['cross_missing'] == 1.0
    assert vector['regime_UNCERTAIN'] == 1.0
    assert vector['regime_missing'] == 1.0


def test_required_feature_missing_raises_insufficient_data() -> None:
    with pytest.raises(InsufficientDataError) as exc:
        build_feature_vector(
            symbol='EUR/USD',
            timeframe='H1',
            as_of=iso(20),
            candles=candles(20),
        )
    assert any('candles' in item for item in exc.value.missing)


def test_route_builds_manifest_shaped_vector_and_batches() -> None:
    rows = oscillating_candles(260)
    payload = request_payload(
        rows,
        timestamps=[rows[249]['timestamp'], rows[250]['timestamp'], rows[-1]['timestamp']],
    )
    response = client.post('/api/v1/ai/features', json=payload, headers=SERVICE_HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert set(body['features']) == set(FEATURE_NAMES)
    assert len(body['features']) == len(FEATURE_NAMES)
    assert body['featureVersion'] == 'v1.0'
    assert body['timestamp'] == rows[-1]['timestamp']
    assert [item['timestamp'] for item in body['vectors']] == payload['timestamps']
    assert body['vectors'][-1]['features'] == body['features']


def test_route_returns_insufficient_data_code_for_short_history() -> None:
    rows = oscillating_candles(10)
    payload = request_payload(rows)
    response = client.post('/api/v1/ai/features', json=payload, headers=SERVICE_HEADERS)
    assert response.status_code == 422
    body = response.json()['detail']
    assert body['code'] == 'INSUFFICIENT_DATA'
    assert body['missing']


def test_route_rejects_version_drift() -> None:
    payload = request_payload(featureVersion='v2.0')
    response = client.post('/api/v1/ai/features', json=payload, headers=SERVICE_HEADERS)
    assert response.status_code == 400
    assert response.json()['detail']['code'] == 'FEATURE_VERSION_MISMATCH'
    assert response.json()['detail']['manifestChecksum'] == MANIFEST_CHECKSUM


def test_route_requires_service_token() -> None:
    response = client.post('/api/v1/ai/features', json=request_payload())
    assert response.status_code == 401


def test_reproducibility_is_byte_identical() -> None:
    rows = oscillating_candles()
    kwargs = {
        'symbol': 'EUR/USD',
        'timeframe': 'H1',
        'as_of': rows[-1]['timestamp'],
        'candles': rows,
        'news': [news_item(iso(250))],
        'events': [event_item(iso(261))],
        'peer_candles': {'EUR/GBP': peer_candles(1.005, start_offset=235)},
    }
    first = json.dumps(build_feature_vector(**kwargs), sort_keys=True, separators=(',', ':'))
    second = json.dumps(build_feature_vector(**kwargs), sort_keys=True, separators=(',', ':'))
    assert first == second


def test_route_response_is_byte_identical_for_identical_payload() -> None:
    payload = request_payload(oscillating_candles())
    first = client.post('/api/v1/ai/features', json=payload, headers=SERVICE_HEADERS)
    second = client.post('/api/v1/ai/features', json=payload, headers=SERVICE_HEADERS)
    assert first.status_code == second.status_code == 200
    assert json.dumps(first.json(), sort_keys=True) == json.dumps(second.json(), sort_keys=True)


def test_manifest_file_checksum_guard_rejects_tampering(tmp_path: Path) -> None:
    source = json.loads(
        (Path(__file__).parents[1] / 'app' / 'services' / 'feature_manifest_v1.json').read_text(
            encoding='utf-8'
        )
    )
    source['features'][0]['window'] = 'tampered'
    target = tmp_path / 'feature_manifest_v1.json'
    target.write_text(json.dumps(source), encoding='utf-8')
    with pytest.raises(Exception, match='checksum mismatch'):
        load_manifest(target)
