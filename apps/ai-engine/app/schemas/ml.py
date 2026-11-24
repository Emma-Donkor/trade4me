"""Internal PHASE 13 training-trigger contracts (not public API routes)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class TrainRequest(BaseModel):
    """A scheduled or manual retraining request; all values are auditable."""

    model_config = ConfigDict(extra='forbid')

    horizon: str = '24h'
    threshold: float = Field(default=0.30, gt=0, lt=1)
    seed: int = 42
    featureVersion: str | None = None
    symbols: list[str] | None = None
    timeframes: list[str] | None = None
    trainStart: str | None = None
    validationStart: str | None = None
    testStart: str | None = None
    end: str | None = None
    calibrationMethod: Literal['platt', 'isotonic'] = 'platt'
    walkForward: bool = True
    registryPath: str | None = None
    reportPath: str | None = None
    writeReport: bool = False


class TrainResponse(BaseModel):
    """The verifiable outcome of one training run."""

    model_config = ConfigDict(extra='forbid')

    datasetVersion: str
    datasetChecksum: str
    datasetRows: int
    featureVersion: str
    selectedModel: str
    selectedVersion: str
    selectionReason: str
    xgboostGatePassed: bool
    calibrationMethod: str
    modelRuns: int
    models: dict[str, dict[str, Any]]
    comparison: list[dict[str, Any]]
    walkForward: dict[str, dict[str, Any]]
