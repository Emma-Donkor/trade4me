"""Prediction explanation endpoint (PHASE 17 implementation pending)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ...schemas import ExplainFactor, ExplainRequest, ExplainResponse

router = APIRouter(tags=['explain'])


@router.post('/explain', response_model=ExplainResponse)
async def explain(request: ExplainRequest) -> ExplainResponse:
    """Placeholder retained so clients can code against the stable contract."""
    raise HTTPException(status_code=501, detail='Not implemented until PHASE 17')


__all__ = ['ExplainFactor', 'ExplainRequest', 'ExplainResponse']
