"""Feature vector endpoint (PHASE 12 implementation pending)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=['features'])


class FeaturesRequest(BaseModel):
    symbol: str
    timeframe: str
    featureVersion: str | None = None


class FeaturesResponse(BaseModel):
    symbol: str
    timeframe: str
    featureVersion: str
    features: dict[str, float]
    timestamp: str


@router.post('/features', response_model=FeaturesResponse)
async def build_features(request: FeaturesRequest) -> FeaturesResponse:
    """Placeholder retained so clients can code against the stable contract."""
    raise HTTPException(status_code=501, detail='Not implemented until PHASE 12')
