"""FastAPI entry point for the TradeSense AI engine."""

from fastapi import FastAPI

from .api.routers import explain, features, health, indicators, predict
from .config import APP_NAME, APP_VERSION, settings
from .logging import configure_logging

configure_logging(settings.LOG_LEVEL)

app = FastAPI(title=APP_NAME, version=APP_VERSION)

# Liveness/readiness stay at the root so platform probes need no service prefix.
app.include_router(health.router)

# Feature stubs live under the AI prefix to avoid colliding with the Node API.
AI_API_PREFIX = '/api/v1/ai'
app.include_router(indicators.router, prefix=AI_API_PREFIX)
app.include_router(features.router, prefix=AI_API_PREFIX)
app.include_router(predict.router, prefix=AI_API_PREFIX)
app.include_router(explain.router, prefix=AI_API_PREFIX)
