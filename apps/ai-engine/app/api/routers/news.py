"""Optional news classification enhancer (PHASE 17)."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from ...deps.auth import require_service_token
from ...schemas import NewsEnhancerRequest, NewsEnhancerResponse
from ...services.news_enhancer import enhance_news

router = APIRouter(tags=['news-enhancer'], dependencies=[Depends(require_service_token)])


@router.post('/news/enhance', response_model=NewsEnhancerResponse)
async def enhance(request: NewsEnhancerRequest) -> NewsEnhancerResponse:
    return await asyncio.to_thread(enhance_news, request)


__all__ = ['NewsEnhancerRequest', 'NewsEnhancerResponse']
