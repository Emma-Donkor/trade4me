"""Fixture-based TypeScript↔Pydantic contract parity for PHASE 05.

`tests/contracts/fixtures/ai-routes.json` is the shared bridge: the TS test
checks it against Zod/OpenAPI, this test checks it against pydantic *and* the
TypeScript interfaces in `packages/types/src/contracts.ts`.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from app.schemas import (
    ExplainFactor,
    ExplainRequest,
    ExplainResponse,
    FeaturesRequest,
    FeaturesResponse,
    IndicatorsRequest,
    IndicatorsResponse,
    PredictRequest,
    PredictResponse,
    TrainRequest,
    TrainResponse,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_PATH = REPO_ROOT / 'tests' / 'contracts' / 'fixtures' / 'ai-routes.json'
CONTRACTS_PATH = REPO_ROOT / 'packages' / 'types' / 'src' / 'contracts.ts'
ROUTERS_DIR = REPO_ROOT / 'apps' / 'ai-engine' / 'app' / 'api' / 'routers'

MODELS: dict[str, Any] = {
    'IndicatorsRequest': IndicatorsRequest,
    'IndicatorsResponse': IndicatorsResponse,
    'FeaturesRequest': FeaturesRequest,
    'FeaturesResponse': FeaturesResponse,
    'PredictRequest': PredictRequest,
    'PredictResponse': PredictResponse,
    'TrainRequest': TrainRequest,
    'TrainResponse': TrainResponse,
    'ExplainRequest': ExplainRequest,
    'ExplainFactor': ExplainFactor,
    'ExplainResponse': ExplainResponse,
}


@pytest.fixture(scope='module')
def fixtures() -> dict[str, dict[str, Any]]:
    return json.loads(FIXTURES_PATH.read_text(encoding='utf-8'))


def test_fixture_file_covers_every_schema(fixtures: dict[str, dict[str, Any]]) -> None:
    assert set(fixtures) == set(MODELS)


@pytest.mark.parametrize('name,model', sorted(MODELS.items()))
def test_pydantic_fields_match_shared_fixture(
    name: str, model: Any, fixtures: dict[str, dict[str, Any]]
) -> None:
    expected = set(fixtures[name]['fields'])
    assert set(model.model_fields) == expected, name

    instance = model.model_validate(fixtures[name]['payload'])
    assert set(instance.model_dump()) == expected, name


def _ts_interface_fields(source: str, name: str) -> set[str]:
    match = re.search(
        rf'export\s+interface\s+{name}\b[^{{]*\{{(?P<body>.*?)\n\s*\}}',
        source,
        re.DOTALL,
    )
    assert match is not None, f'contracts.ts does not export interface {name}'
    return set(
        re.findall(
            r'(?m)^\s*(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\??\s*:',
            match.group('body'),
        )
    )


@pytest.mark.parametrize('name', sorted(MODELS))
def test_typescript_interface_matches_shared_fixture(
    name: str, fixtures: dict[str, dict[str, Any]]
) -> None:
    source = CONTRACTS_PATH.read_text(encoding='utf-8')
    assert _ts_interface_fields(source, name) == set(fixtures[name]['fields']), name


@pytest.mark.parametrize('router', ['indicators', 'features', 'predict', 'explain'])
def test_stub_routers_import_single_schema_module(router: str) -> None:
    source = (ROUTERS_DIR / f'{router}.py').read_text(encoding='utf-8')
    assert 'from ...schemas import' in source
    assert not re.search(r'^class \w+\(BaseModel\)', source, re.MULTILINE)
