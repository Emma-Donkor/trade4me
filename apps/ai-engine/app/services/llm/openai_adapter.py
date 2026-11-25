"""OpenAI-compatible chat-completions adapter.

The API key stays server-side, requests are bounded by token and wall-clock
limits, and every failure is converted into an ``LlmError`` so callers degrade
to the deterministic template instead of leaking an outage to users.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from .base import LlmError, LlmRequest, LlmResponse, LlmTimeoutError, LlmUnavailableError


class OpenAIAdapter:
    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = 'https://api.openai.com/v1',
        max_tokens: int = 700,
        timeout_ms: int = 15_000,
        temperature: float = 0.0,
    ) -> None:
        self._api_key = api_key.strip()
        self.model = model
        self._base_url = base_url.rstrip('/')
        self._max_tokens = max_tokens
        self._timeout_seconds = max(1, timeout_ms) / 1000
        self._temperature = temperature
        self.is_template = False

    def complete(self, request: LlmRequest) -> LlmResponse:
        if not self._api_key:
            raise LlmUnavailableError('AI_API_KEY is not configured')
        started = time.perf_counter()
        body: dict[str, Any] = {
            'model': self.model,
            'messages': [
                {'role': 'system', 'content': request.system_prompt},
                {'role': 'user', 'content': request.user_prompt},
            ],
            'temperature': request.temperature if request.temperature >= 0 else self._temperature,
            'max_tokens': min(request.max_tokens, self._max_tokens),
        }
        try:
            with httpx.Client(timeout=self._timeout_seconds) as client:
                response = client.post(
                    f'{self._base_url}/chat/completions',
                    headers={
                        'Authorization': f'Bearer {self._api_key}',
                        'Content-Type': 'application/json',
                    },
                    json=body,
                )
        except httpx.TimeoutException as exc:
            raise LlmTimeoutError('LLM request timed out') from exc
        except httpx.HTTPError as exc:
            raise LlmUnavailableError('LLM endpoint unreachable') from exc

        if response.status_code in (408, 429) or response.status_code >= 500:
            raise LlmUnavailableError(f'LLM returned HTTP {response.status_code}')
        if not response.is_success:
            raise LlmUnavailableError(f'LLM returned HTTP {response.status_code}')
        try:
            payload = response.json()
            text = payload['choices'][0]['message']['content']
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise LlmUnavailableError('LLM returned an unusable response') from exc
        if not isinstance(text, str) or not text.strip():
            raise LlmUnavailableError('LLM returned empty content')

        return LlmResponse(
            text=text.strip(),
            model=self.model,
            source='llm',
            latency_ms=int((time.perf_counter() - started) * 1000),
            attempt=request.attempt,
        )


def is_retryable(error: Exception) -> bool:
    return isinstance(error, (LlmTimeoutError, LlmUnavailableError)) and isinstance(error, LlmError)


__all__ = ['OpenAIAdapter', 'is_retryable']
