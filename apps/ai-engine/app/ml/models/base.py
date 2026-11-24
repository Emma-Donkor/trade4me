"""Shared training result type for the three model slots."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ModelFit:
    """A fitted estimator plus the exact hyperparameters used to produce it."""

    name: str
    version: str
    estimator: Any
    hyperparams: dict[str, Any]
    feature_names: tuple[str, ...]
    seed: int
