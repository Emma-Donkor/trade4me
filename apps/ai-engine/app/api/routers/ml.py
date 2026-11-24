"""Internal retraining trigger used by the API's `model-eval` worker."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ...config import settings
from ...deps.auth import require_service_token
from ...ml.dataset import parse_horizon
from ...ml.train import TrainingConfig, run_training
from ...schemas import DriftRequest, DriftResponse, TrainRequest, TrainResponse
from ...services.drift import DriftConfig, evaluate_drift

router = APIRouter()


@router.post('/ml/train', response_model=TrainResponse)
async def train(request: TrainRequest, _token: str = Depends(require_service_token)) -> TrainResponse:
    """Run the full pipeline; heavy CPU work stays off the event loop."""
    try:
        parse_horizon(request.horizon)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    config = TrainingConfig(
        horizon=request.horizon,
        threshold_pct=request.threshold,
        seed=request.seed,
        feature_version=request.featureVersion or settings.FEATURE_VERSION,
        database_url=settings.DATABASE_URL,
        registry_path=request.registryPath or settings.MODEL_REGISTRY_PATH,
        symbols=tuple(request.symbols) if request.symbols else None,
        timeframes=tuple(request.timeframes) if request.timeframes else None,
        train_start=request.trainStart,
        validation_start=request.validationStart,
        test_start=request.testStart,
        end=request.end,
        calibration_method=request.calibrationMethod,
        walk_forward=request.walkForward and settings.WALK_FORWARD_ENABLED,
        write_report=request.writeReport,
        report_path=request.reportPath or 'docs/ml-comparison.md',
    )
    try:
        result: dict[str, Any] = await asyncio.to_thread(asyncio.run, run_training(config))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return TrainResponse.model_validate(
        {name: result[name] for name in TrainResponse.model_fields}
    )


@router.post('/ml/drift', response_model=DriftResponse)
async def drift(request: DriftRequest, _token: str = Depends(require_service_token)) -> DriftResponse:
    """Compare recent ACTIVE-model outcomes with historical performance."""
    config = DriftConfig(
        minSamples=request.minSamples,
        recentWindow=request.recentWindow,
        accuracyDrop=request.accuracyDrop,
        brierIncrease=request.brierIncrease,
    )
    try:
        report = await evaluate_drift(settings.DATABASE_URL, config=config)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return DriftResponse.model_validate(report.to_dict())
