"""Single place that decides whether an LLM is actually available."""

from __future__ import annotations

from ...config import settings
from .base import LlmProvider
from .mock_llm import MockLLM
from .openai_adapter import OpenAIAdapter


def default_provider() -> LlmProvider:
    """Return the real adapter only when a key is present; otherwise template mode."""
    provider = settings.AI_LLM_PROVIDER.strip().lower()
    if provider == 'mock' or not settings.AI_API_KEY.strip():
        return MockLLM()
    return OpenAIAdapter(
        api_key=settings.AI_API_KEY,
        model=settings.AI_LLM_MODEL,
        base_url=settings.AI_LLM_BASE_URL,
        max_tokens=settings.AI_LLM_MAX_TOKENS,
        timeout_ms=settings.AI_LLM_TIMEOUT_MS,
        temperature=settings.AI_LLM_TEMPERATURE,
    )


__all__ = ['default_provider']
