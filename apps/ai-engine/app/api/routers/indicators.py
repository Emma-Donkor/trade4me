"""Real technical indicator endpoint (PHASE 10).

Internal, service-token protected and bounded: the API sends an already-fetched
OHLC window; the Python engine is the single math authority and never fetches
market data itself.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ...deps.auth import require_service_token
from ...schemas import IndicatorsRequest, IndicatorsResponse
from ...services.indicators import compute_all, parse_candles
from ...services.patterns import detect_patterns
from ...services.regime import classify
from ...services.scoring import score_technical

MAX_CANDLES = 500

router = APIRouter(tags=['indicators'], dependencies=[Depends(require_service_token)])

# Re-exported so existing contract tests importing from the router keep working.
__all__ = ['IndicatorsRequest', 'IndicatorsResponse', 'compute_indicators']


@router.post('/indicators', response_model=IndicatorsResponse)
async def compute_indicators(request: IndicatorsRequest) -> IndicatorsResponse:
    """Compute indicators, contextual patterns, regime and technical score."""
    if not request.candles:
        raise HTTPException(status_code=422, detail='A non-empty candle window is required')
    if len(request.candles) > MAX_CANDLES:
        raise HTTPException(status_code=422, detail=f'Candle window exceeds {MAX_CANDLES} bars')
    try:
        candles = parse_candles([candle.model_dump() for candle in request.candles])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        values = compute_all(candles, request.timeframe, request.indicators)
        patterns = detect_patterns(candles)
        regime = classify(candles)
        score = score_technical(values, patterns, regime)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    payload: dict[str, Any] = dict(values)
    payload.update(
        {
            'patterns': patterns,
            'regime': regime,
            'score': score,
            'metadata': {
                'candleCount': len(candles),
                'from': candles[0].timestamp,
                'to': candles[-1].timestamp,
                'indicativeNote': (
                    'OBV/VWAP are indicative: spot forex has no centralised volume.'
                ),
            },
        }
    )
    return IndicatorsResponse(
        symbol=request.symbol,
        timeframe=request.timeframe,
        indicators=payload,
        computedAt=candles[-1].timestamp or datetime.now(timezone.utc).isoformat(),
    )
