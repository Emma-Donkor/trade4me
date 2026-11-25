"""Internal grounded assistant endpoint (PHASE 17)."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from ...deps.auth import require_service_token
from ...schemas import AssistantRequestV2, AssistantResponseV2
from ...services.assistant import generate_answer

router = APIRouter(tags=['assistant'], dependencies=[Depends(require_service_token)])


@router.post('/assistant', response_model=AssistantResponseV2)
async def assistant(request: AssistantRequestV2) -> AssistantResponseV2:
    result = await asyncio.to_thread(generate_answer, request)
    return AssistantResponseV2(
        answer=result.answer,
        sources=result.sources,
        grounded=result.grounded,
        hasData=result.has_data,
        explanationSource=result.source,
        llmModel=result.model,
    )


__all__ = ['AssistantRequestV2', 'AssistantResponseV2']
