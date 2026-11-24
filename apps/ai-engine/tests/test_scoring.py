"""Technical score bounds, configured weights and Python↔TS parity."""

from __future__ import annotations

import re
from pathlib import Path

from app.services.indicators import Candle, compute_all
from app.services.regime import classify
from app.services.scoring import TECHNICAL_SUBWEIGHTS, score_technical

REPO_ROOT = Path(__file__).resolve().parents[3]
WEIGHTS_PATH = REPO_ROOT / 'packages' / 'config' / 'src' / 'weights.ts'


def rising() -> list[Candle]:
    return [
        Candle(
            timestamp=f'2026-01-01T{index:04d}:00:00.000Z',
            open=1.0 + index * 0.002,
            high=1.0002 + index * 0.002,
            low=0.9998 + index * 0.002,
            close=1.0 + index * 0.002,
            volume=100.0,
        )
        for index in range(120)
    ]


def test_subweights_match_typescript_manifest() -> None:
    source = WEIGHTS_PATH.read_text(encoding='utf-8')
    match = re.search(r'export const TECHNICAL_SUBWEIGHTS[^=]*=\s*\{(?P<body>.*?)\}', source, re.DOTALL)
    assert match is not None
    ts_weights = {key: float(value) for key, value in re.findall(r'(\w+):\s*([0-9.]+)', match.group('body'))}
    assert ts_weights == TECHNICAL_SUBWEIGHTS


def test_score_is_bounded_and_has_all_subscores() -> None:
    candles = rising()
    indicators = compute_all(candles, 'H1')
    regime = classify(candles)
    result = score_technical(indicators, [], regime)
    assert 0 <= result['score'] <= 100
    assert set(result['subScores']) == set(TECHNICAL_SUBWEIGHTS)
    assert result['weights'] == TECHNICAL_SUBWEIGHTS


def test_custom_weights_change_the_score_as_configured() -> None:
    candles = rising()
    indicators = compute_all(candles, 'H1')
    regime = classify(candles)
    bullish = score_technical(indicators, [], regime, {'trend': 1.0, **{key: 0.0 for key in TECHNICAL_SUBWEIGHTS if key != 'trend'}})
    flat = score_technical(indicators, [], regime, {'regime': 1.0, **{key: 0.0 for key in TECHNICAL_SUBWEIGHTS if key != 'regime'}})
    assert bullish['score'] != flat['score']


def test_invalid_weights_rejected() -> None:
    try:
        score_technical({}, [], {}, {'trend': 0.5})
    except ValueError as exc:
        assert 'weights' in str(exc)
    else:
        raise AssertionError('invalid weight manifest must be rejected')
