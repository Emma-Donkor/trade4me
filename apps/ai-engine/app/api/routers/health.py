"""Liveness and readiness endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from ...config import HEALTH_PATH
from ...deps import db as db_deps
from ...deps import redis as redis_deps

router = APIRouter(tags=['health'])


async def check_database() -> dict[str, Any]:
    """Delegate at call time so patches on the dependency module take effect."""
    return await db_deps.check_database()


async def check_redis() -> dict[str, Any]:
    """Delegate at call time so patches on the dependency module take effect."""
    return await redis_deps.check_redis()


@router.get(HEALTH_PATH)
async def liveness() -> dict[str, str]:
    """Process is running; no dependency checks required."""
    return {'status': 'ok'}


@router.get('/health/ready')
async def readiness() -> dict[str, Any]:
    """Report database and Redis reachability without failing the request."""
    database = await check_database()
    cache = await check_redis()
    dependencies: dict[str, dict[str, Any]] = {'database': database, 'redis': cache}
    overall = (
        'ok'
        if all(check['status'] == 'up' for check in dependencies.values())
        else 'degraded'
    )
    return {
        'status': overall,
        'database': database,
        'redis': cache,
        'dependencies': dependencies,
    }
