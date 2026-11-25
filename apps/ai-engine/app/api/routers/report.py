"""Internal AI market-report narrator (PHASE 17)."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from ...deps.auth import require_service_token
from ...schemas import ReportRequest, ReportResponse
from ...services.report import generate_report, summary_of

router = APIRouter(tags=['report'], dependencies=[Depends(require_service_token)])


@router.post('/report', response_model=ReportResponse)
async def report(request: ReportRequest) -> ReportResponse:
    result = await asyncio.to_thread(generate_report, request)
    scenarios = list(result.scenarios)
    assert sum(scenario.probability for scenario in scenarios) == 100
    return ReportResponse(
        symbol=request.symbol,
        summary=summary_of(result.text) or request.summary,
        scenarios=scenarios,
        decision=request.decision,
        warnings=list(request.warnings),
        generatedAt=request.asOf,
        trend=request.trend,
        technicalEvidence=list(request.technicalEvidence),
        historicalEvidence=list(request.historicalEvidence),
        newsEvidence=list(request.newsEvidence),
        prediction=request.prediction,
        risk=request.risk,
        reasons=list(request.reasons),
        explanationText=result.text,
        explanationSource=result.source,
        llmModel=result.model,
        payloadHash=result.payload_hash,
    )


__all__ = ['ReportRequest', 'ReportResponse']
