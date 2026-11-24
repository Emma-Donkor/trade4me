"""Service-to-service authentication for internal AI routes (PHASE 10).

The browser never talks to :8000 directly. Every ``/api/v1/ai/*`` operation
requires the shared ``X-Service-Token`` header; liveness/readiness stay public
so orchestrators can probe without secrets.
"""

from __future__ import annotations

import hmac
from functools import lru_cache

from fastapi import Header, HTTPException, status

from ..config import Settings


@lru_cache(maxsize=1)
def _settings() -> Settings:
    return Settings()


def require_service_token(x_service_token: str | None = Header(default=None, alias='X-Service-Token')) -> None:
    expected = _settings().AI_SERVICE_TOKEN
    if x_service_token is None or not hmac.compare_digest(x_service_token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid service token')
