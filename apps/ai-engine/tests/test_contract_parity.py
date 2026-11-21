"""Python/TypeScript configuration and API contract parity guards.

The TypeScript packages are the source of truth shared with the Node API; these
tests fail loudly if either side drifts away from the other.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.api.routers.explain import ExplainFactor, ExplainRequest, ExplainResponse
from app.api.routers.features import FeaturesRequest, FeaturesResponse
from app.api.routers.indicators import IndicatorsRequest, IndicatorsResponse
from app.api.routers.predict import PredictRequest, PredictResponse
from app.config import Settings

REPO_ROOT = Path(__file__).resolve().parents[3]
ENV_PATH = REPO_ROOT / 'packages' / 'config' / 'src' / 'env.ts'
CONTRACTS_PATH = REPO_ROOT / 'packages' / 'types' / 'src' / 'contracts.ts'

# The roadmap uses singular names for a few contracts; accept either spelling
# while still requiring the field sets to match exactly.
CONTRACT_MODELS: dict[str, tuple[tuple[str, ...], Any]] = {
    'IndicatorsRequest': (('IndicatorsRequest', 'IndicatorRequest'), IndicatorsRequest),
    'IndicatorsResponse': (('IndicatorsResponse', 'IndicatorResponse'), IndicatorsResponse),
    'FeaturesRequest': (('FeaturesRequest', 'FeatureRequest'), FeaturesRequest),
    'FeaturesResponse': (('FeaturesResponse', 'FeatureResponse'), FeaturesResponse),
    'PredictRequest': (('PredictRequest',), PredictRequest),
    'PredictResponse': (('PredictResponse',), PredictResponse),
    'ExplainRequest': (('ExplainRequest',), ExplainRequest),
    'ExplainResponse': (('ExplainResponse',), ExplainResponse),
}


def _extract_env_keys(source: str) -> set[str]:
    """Read the property names declared inside ``envSchema = z.object({...})``."""
    block = re.search(
        r'envSchema\s*=\s*z\.object\(\{(?P<body>.*?)\n\s*\}',
        source,
        re.DOTALL,
    )
    body = block.group('body') if block else source
    return set(re.findall(r'(?m)^\s*[\'"]?([A-Z][A-Z0-9_]*)[\'"]?\s*:', body))


def _extract_interface_fields(source: str, name: str) -> set[str]:
    """Read the field names of an exported interface (or type alias)."""
    match = re.search(
        rf'export\s+(?:interface|type)\s+{name}\b[^{{]*\{{(?P<body>.*?)\n\s*\}}',
        source,
        re.DOTALL,
    )
    assert match is not None, f'contracts.ts does not export {name}'
    return set(
        re.findall(
            r'(?m)^\s*(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\??\s*:',
            match.group('body'),
        )
    )


def test_env_schema_matches_settings_fields() -> None:
    ts_keys = _extract_env_keys(ENV_PATH.read_text(encoding='utf-8'))

    assert ts_keys == set(Settings.model_fields)


def test_local_data_tier_defaults_match_compose() -> None:
    defaults = {name: field.default for name, field in Settings.model_fields.items()}

    assert 'localhost:5433' in defaults['DATABASE_URL']
    assert defaults['REDIS_URL'] == 'redis://localhost:6380'


def test_contract_interfaces_match_pydantic_models() -> None:
    source = CONTRACTS_PATH.read_text(encoding='utf-8')

    for label, (candidates, model) in CONTRACT_MODELS.items():
        present = [name for name in candidates if re.search(rf'export\s+interface\s+{name}\b', source)]
        assert present, f'contracts.ts does not export {label}'
        assert _extract_interface_fields(source, present[0]) == set(model.model_fields), label

    if re.search(r'export\s+interface\s+(?:ExplainFactor|ExplanationFactor)\b', source):
        name = 'ExplainFactor' if 'ExplainFactor' in source else 'ExplanationFactor'
        assert _extract_interface_fields(source, name) == set(ExplainFactor.model_fields)
