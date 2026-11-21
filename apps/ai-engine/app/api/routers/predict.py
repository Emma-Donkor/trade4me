"""Prediction endpoint (PHASE 14 implementation pending)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ...schemas import PredictRequest, PredictResponse

router = APIRouter(tags=['predict'])


@router.post('/predict', response_model=PredictResponse)
async def predict(request: PredictRequest) -> PredictResponse:
    """Placeholder retained so clients can code against the stable contract."""
    raise HTTPException(status_code=501, detail='Not implemented until PHASE 14')
