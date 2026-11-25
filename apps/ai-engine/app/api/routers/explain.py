"""Grounded prediction explanation endpoint (PHASE 17)."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from ...deps.auth import require_service_token
from ...schemas import (
    ExplainFactor,
    ExplainRequest,
    ExplainResponse,
    ExplanationRequestV2,
    ExplanationResponseV2,
    ExplanationValidationResult,
)
from ...services.explanation import build_facts, generate_explanation

router = APIRouter(tags=['explain'], dependencies=[Depends(require_service_token)])


@router.post('/explain', response_model=ExplanationResponseV2)
async def explain(request: ExplanationRequestV2) -> ExplanationResponseV2:
    """Narrate a *verified* payload; no inference or decision happens here."""
    result = await asyncio.to_thread(generate_explanation, request)
    payload = request.payload.model_dump()
    facts = build_facts(request)
    return ExplanationResponseV2(
        predictionId=request.predictionId,
        decision=facts['decision'],
        supporting=list(facts['supporting']),
        contradicting=list(facts['contradicting']),
        final=facts['final'],
        probability=float(facts['probabilityPercent']),
        confidence=float(facts['confidence']),
        riskLevel=payload['risk'],
        dataFreshnessSeconds=payload['dataFreshnessSeconds'],
        modelVersion=payload['modelVersion'],
        timestamp=request.timestamp,
        factors=result.factors,
        summary=result.summary,
        explanationText=result.text,
        explanationSource=result.source,
        llmModel=result.model,
        payloadHash=result.payload_hash,
        validation=ExplanationValidationResult(
            valid=result.validation.valid,
            violations=list(result.validation.violations),
            attempts=result.attempts,
        ),
    )


__all__ = [
    'ExplainFactor',
    'ExplainRequest',
    'ExplainResponse',
    'ExplanationRequestV2',
    'ExplanationResponseV2',
]
