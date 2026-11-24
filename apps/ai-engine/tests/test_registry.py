"""Registry row writes are deterministic and Prisma-column compatible."""

from __future__ import annotations

import asyncio
import sys
import types
from datetime import datetime, timezone
from typing import Any

import pytest

from app.ml import registry


class FakeTransaction:
    async def __aenter__(self) -> 'FakeTransaction':
        return self

    async def __aexit__(self, *_: object) -> None:
        return None


class FakeConnection:
    def __init__(self) -> None:
        self.statements: list[tuple[str, tuple[Any, ...]]] = []

    def transaction(self) -> FakeTransaction:
        return FakeTransaction()

    async def fetchval(self, sql: str, *args: Any) -> str:
        self.statements.append((sql, args))
        return str(args[0])

    async def execute(self, sql: str, *args: Any) -> None:
        self.statements.append((sql, args))

    async def close(self) -> None:
        return None


def _spec() -> dict[str, Any]:
    return {
        'name': 'registry-model',
        'version': '1.0.0',
        'featureVersion': 'v1.0',
        'trainingDatasetVersion': 'checksum',
        'hyperparams': {'seed': 42},
        'metrics': {'brier': 0.12},
        'status': 'ACTIVE',
    }


def _run() -> dict[str, Any]:
    return {
        'modelKey': 'registry-model:1.0.0',
        'startedAt': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'finishedAt': datetime(2026, 1, 2, tzinfo=timezone.utc),
        'trainRange': {'from': '2023-01-01', 'to': '2023-12-31'},
        'testRange': {'from': '2025-01-01', 'to': '2025-12-31'},
        'seed': 42,
        'artifactsPath': './models/registry-model/1.0.0',
        'metrics': {'brier': 0.12},
    }


def _capture(monkeypatch: pytest.MonkeyPatch) -> list[FakeConnection]:
    connections: list[FakeConnection] = []

    async def connect(_: str) -> FakeConnection:
        connection = FakeConnection()
        connections.append(connection)
        return connection

    fake = types.ModuleType('asyncpg')
    fake.connect = connect  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, 'asyncpg', fake)
    return connections


def test_registry_rows_are_stable_and_include_prisma_columns(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connections = _capture(monkeypatch)

    async def invoke() -> list[str]:
        return await registry.write_registry_rows(
            'postgresql://user:pass@localhost/db',
            versions=[_spec()],
            runs=[_run()],
        )

    first = asyncio.run(invoke())
    second = asyncio.run(invoke())
    assert first == second
    sql = '\n'.join(statement for statement, _ in connections[0].statements)
    assert '"id"' in sql
    assert '"updatedAt"' in sql
    assert 'ON CONFLICT ("name", "version")' in sql
    assert 'DELETE FROM "ModelRun"' in sql
    # Timestamps are stored as timestamp(3) without time zone by Prisma.
    run_args = connections[0].statements[-1][1]
    assert run_args[2].tzinfo is None
    assert run_args[3].tzinfo is None
