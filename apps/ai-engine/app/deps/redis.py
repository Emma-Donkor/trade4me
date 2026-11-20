"""Redis readiness probe."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import redis.asyncio as redis_asyncio

from ..config import settings

_TIMEOUT_SECONDS = 1.5


def _latency_ms(started_at: float) -> int:
    return int((time.perf_counter() - started_at) * 1000)


async def check_redis() -> dict[str, Any]:
    """Return the current Redis status; never raise to the caller."""
    started_at = time.perf_counter()
    client: Any = None
    try:
        client = redis_asyncio.from_url(
            settings.REDIS_URL,
            socket_connect_timeout=_TIMEOUT_SECONDS,
            socket_timeout=_TIMEOUT_SECONDS,
        )
        pong = await asyncio.wait_for(client.ping(), timeout=_TIMEOUT_SECONDS)
        if pong is not True:
            raise RuntimeError('Redis PING did not return PONG')
    except Exception as exc:  # noqa: BLE001 - readiness reports failures, never crashes
        return {
            'status': 'down',
            'latencyMs': _latency_ms(started_at),
            'error': str(exc) or exc.__class__.__name__,
        }
    finally:
        if client is not None:
            closer = getattr(client, 'aclose', None) or getattr(client, 'close', None)
            if closer is not None:
                try:
                    await closer()
                except Exception:  # noqa: BLE001 - failure to close must not mask the check
                    pass

    return {
        'status': 'up',
        'latencyMs': _latency_ms(started_at),
        'error': None,
    }
