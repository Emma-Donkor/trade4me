"""Database readiness probe."""

from __future__ import annotations

import asyncio
import time
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import asyncpg

from ..config import settings

_CONNECT_TIMEOUT_SECONDS = 1.5
_QUERY_TIMEOUT_SECONDS = 1.0


def _latency_ms(started_at: float) -> int:
    return int((time.perf_counter() - started_at) * 1000)


def asyncpg_dsn(url: str) -> str:
    """Strip Prisma-only query parameters (e.g. ``schema``) for asyncpg."""
    parts = urlsplit(url)
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key != 'schema'
    ]
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )


async def check_database() -> dict[str, Any]:
    """Return the current PostgreSQL status; never raise to the caller."""
    started_at = time.perf_counter()
    connection: asyncpg.Connection | None = None
    try:
        connection = await asyncio.wait_for(
            asyncpg.connect(
                asyncpg_dsn(settings.DATABASE_URL), timeout=_CONNECT_TIMEOUT_SECONDS
            ),
            timeout=_CONNECT_TIMEOUT_SECONDS,
        )
        await asyncio.wait_for(
            connection.fetchval('SELECT 1', timeout=_QUERY_TIMEOUT_SECONDS),
            timeout=_QUERY_TIMEOUT_SECONDS,
        )
    except Exception as exc:  # noqa: BLE001 - readiness reports failures, never crashes
        return {
            'status': 'down',
            'latencyMs': _latency_ms(started_at),
            'error': str(exc) or exc.__class__.__name__,
        }
    finally:
        if connection is not None:
            try:
                await connection.close()
            except Exception:  # noqa: BLE001 - failure to close must not mask the check
                pass

    return {
        'status': 'up',
        'latencyMs': _latency_ms(started_at),
        'error': None,
    }
