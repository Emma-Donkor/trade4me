"""Technical indicator endpoint (PHASE 10 implementation pending)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ...schemas import IndicatorsRequest, IndicatorsResponse

router = APIRouter(tags=['indicators'])


@router.post('/indicators', response_model=IndicatorsResponse)
async def compute_indicators(request: IndicatorsRequest) -> IndicatorsResponse:
    """Placeholder retained so clients can code against the stable contract."""
    raise HTTPException(status_code=501, detail='Not implemented until PHASE 10')
