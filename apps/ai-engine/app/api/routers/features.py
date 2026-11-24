"""Real feature-vector endpoint (PHASE 12).

Internal, service-token protected and bounded. The Node API supplies the
already-fetched inputs; Python is the single math authority and never reads a
database, cache or clock. Every requested timestamp is an independent cutoff.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ...config import settings
from ...deps.auth import require_service_token
from ...schemas import FeaturesRequest, FeaturesResponse, FeatureVectorItem
from ...services.feature_manifest import MANIFEST_CHECKSUM
from ...services.features import (
    MAX_CANDLES,
    MAX_VECTORS,
    InsufficientDataError,
    build_rolling_vectors,
    parse_timestamp,
)

router = APIRouter(tags=['features'], dependencies=[Depends(require_service_token)])

# Re-exported so contract tests importing from the router keep working.
__all__ = ['FeaturesRequest', 'FeaturesResponse', 'build_features', 'MANIFEST_CHECKSUM']


@router.post('/features', response_model=FeaturesResponse)
async def build_features(request: FeaturesRequest) -> FeaturesResponse:
    """Build one latest vector plus bounded rolling vectors from the same inputs."""
    version = request.featureVersion or settings.FEATURE_VERSION
    if version != settings.FEATURE_VERSION:
        raise HTTPException(
            status_code=400,
            detail={
                'code': 'FEATURE_VERSION_MISMATCH',
                'message': f'This engine serves feature version {settings.FEATURE_VERSION}',
                'manifestChecksum': MANIFEST_CHECKSUM,
            },
        )
    if not request.candles:
        raise HTTPException(status_code=422, detail='A non-empty candle window is required')
    if len(request.candles) > MAX_CANDLES:
        raise HTTPException(status_code=422, detail=f'Candle window exceeds {MAX_CANDLES} bars')

    try:
        as_of = parse_timestamp(request.asOf)
        timestamps = request.timestamps or [request.asOf]
        if len(timestamps) > MAX_VECTORS:
            raise HTTPException(
                status_code=422, detail=f'Vector batch exceeds {MAX_VECTORS} timestamps'
            )
        regimes = {request.asOf: request.regime.model_dump()} if request.regime else {}
        vectors = build_rolling_vectors(
            symbol=request.symbol,
            timeframe=request.timeframe,
            as_of=as_of,
            candles=[candle.model_dump() for candle in request.candles],
            timestamps=timestamps,
            peer_candles=(
                {symbol: [item.model_dump() for item in rows] for symbol, rows in request.peerCandles.items()}
                if request.peerCandles
                else None
            ),
            news=[item.model_dump() for item in request.news] if request.news else None,
            events=[item.model_dump() for item in request.events] if request.events else None,
            regimes=regimes,
            compute_regime=True,
            feature_version=version,
        )
    except InsufficientDataError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                'code': 'INSUFFICIENT_DATA',
                'message': str(exc),
                'missing': list(exc.missing),
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    latest = vectors[-1]
    return FeaturesResponse(
        symbol=request.symbol,
        timeframe=request.timeframe,
        featureVersion=version,
        features=latest['features'],
        timestamp=latest['timestamp'],
        vectors=[FeatureVectorItem(**item) for item in vectors],
    )
