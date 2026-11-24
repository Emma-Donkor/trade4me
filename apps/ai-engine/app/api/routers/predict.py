"""Internal P14 prediction route: exact features in, calibrated contract out."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ...deps.auth import require_service_token
from ...schemas import PredictRequest, PredictResponse
from ...services.predict import PredictionError, PredictionInput, predict

router = APIRouter(tags=['predict'], dependencies=[Depends(require_service_token)])
__all__ = ['PredictRequest', 'PredictResponse', 'predict']


@router.post('/predict', response_model=PredictResponse)
async def predict_route(request: PredictRequest) -> PredictResponse:
    """Serve one prediction for the caller's exact, versioned feature vector."""
    try:
        result = await predict(
            PredictionInput(
                symbol=request.symbol,
                timeframe=request.timeframe,
                horizonMinutes=request.horizon,
                featureVersion=request.featureVersion,
                asOf=request.asOf,
                features=request.features,
            )
        )
    except PredictionError as exc:
        status = 400 if exc.code == 'FEATURE_VERSION_MISMATCH' else 422
        raise HTTPException(
            status_code=status,
            detail={'code': exc.code, 'message': exc.message},
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={'code': 'INVALID_PREDICTION_INPUT', 'message': str(exc)},
        ) from exc
    return PredictResponse.model_validate(result.to_dict())
