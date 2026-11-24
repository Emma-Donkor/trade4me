"""Feature vector endpoint (PHASE 12 implementation pending)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ...deps.auth import require_service_token
from ...schemas import FeaturesRequest, FeaturesResponse

router = APIRouter(tags=['features'], dependencies=[Depends(require_service_token)])


@router.post('/features', response_model=FeaturesResponse)
async def build_features(request: FeaturesRequest) -> FeaturesResponse:
    """Placeholder retained so clients can code against the stable contract."""
    raise HTTPException(status_code=501, detail='Not implemented until PHASE 12')
