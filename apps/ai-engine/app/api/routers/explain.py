"""Prediction explanation endpoint (PHASE 17 implementation pending)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=['explain'])


class ExplainFactor(BaseModel):
    name: str
    impact: float


class ExplainRequest(BaseModel):
    predictionId: str


class ExplainResponse(BaseModel):
    predictionId: str
    summary: str
    factors: list[ExplainFactor]


@router.post('/explain', response_model=ExplainResponse)
async def explain(request: ExplainRequest) -> ExplainResponse:
    """Placeholder retained so clients can code against the stable contract."""
    raise HTTPException(status_code=501, detail='Not implemented until PHASE 17')
