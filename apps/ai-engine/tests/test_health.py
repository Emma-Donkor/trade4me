"""Health endpoint tests with dependency checks fully stubbed out."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi.testclient import TestClient

from app.api.routers import health as health_router
from app.deps import db as db_checks
from app.deps import redis as redis_checks
from app.main import app

client = TestClient(app)


def _result(status: str, error: str | None = None) -> dict[str, Any]:
    return {'status': status, 'latencyMs': 1, 'error': error}


def test_health_returns_ok() -> None:
    response = client.get('/health')

    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}


def test_ready_returns_ok_when_all_dependencies_are_up(monkeypatch: Any) -> None:
    async def database_up() -> dict[str, Any]:
        return _result('up')

    async def redis_up() -> dict[str, Any]:
        return _result('up')

    monkeypatch.setattr(health_router, 'check_database', database_up)
    monkeypatch.setattr(health_router, 'check_redis', redis_up)

    response = client.get('/health/ready')

    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'ok'
    assert body['database'] == _result('up')
    assert body['redis'] == _result('up')
    assert body['dependencies']['database']['status'] == 'up'
    assert body['dependencies']['redis']['status'] == 'up'


def test_ready_reports_degraded_when_database_is_down(monkeypatch: Any) -> None:
    async def database_down() -> dict[str, Any]:
        return _result('down', 'connection refused')

    async def redis_up() -> dict[str, Any]:
        return _result('up')

    monkeypatch.setattr(health_router, 'check_database', database_down)
    monkeypatch.setattr(health_router, 'check_redis', redis_up)

    response = client.get('/health/ready')

    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'degraded'
    assert body['database']['error'] == 'connection refused'
    assert body['redis']['status'] == 'up'


def test_ready_reports_degraded_when_redis_is_down(monkeypatch: Any) -> None:
    async def database_up() -> dict[str, Any]:
        return _result('up')

    async def redis_down() -> dict[str, Any]:
        return _result('down', 'PING failed')

    monkeypatch.setattr(health_router, 'check_database', database_up)
    monkeypatch.setattr(health_router, 'check_redis', redis_down)

    response = client.get('/health/ready')

    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'degraded'
    assert body['database']['status'] == 'up'
    assert body['redis']['error'] == 'PING failed'


def test_ready_honours_patches_on_dependency_modules(monkeypatch: Any) -> None:
    async def database_down() -> dict[str, Any]:
        return _result('down', 'unreachable')

    async def redis_up() -> dict[str, Any]:
        return _result('up')

    monkeypatch.setattr(db_checks, 'check_database', database_down)
    monkeypatch.setattr(redis_checks, 'check_redis', redis_up)

    response = client.get('/health/ready')

    assert response.status_code == 200
    assert response.json()['status'] == 'degraded'


def test_database_check_never_raises(monkeypatch: Any) -> None:
    def connect_fails(*args: Any, **kwargs: Any) -> None:
        raise OSError('no database')

    monkeypatch.setattr(db_checks.asyncpg, 'connect', connect_fails)

    result = asyncio.run(db_checks.check_database())

    assert result['status'] == 'down'
    assert result['error'] == 'no database'
    assert isinstance(result['latencyMs'], int)


def test_redis_check_never_raises(monkeypatch: Any) -> None:
    def client_fails(*args: Any, **kwargs: Any) -> None:
        raise OSError('no redis')

    monkeypatch.setattr(redis_checks.redis_asyncio, 'from_url', client_fails)

    result = asyncio.run(redis_checks.check_redis())

    assert result['status'] == 'down'
    assert result['error'] == 'no redis'
    assert isinstance(result['latencyMs'], int)
