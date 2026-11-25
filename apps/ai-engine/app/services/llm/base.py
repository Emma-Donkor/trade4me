"""Provider-neutral LLM boundary.

Nothing above this module knows which model produced a string. The request
carries a fixed system prompt plus a *verified* facts mapping; every provider
returns the same immutable response shape so audit fields cannot drift.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Protocol

LlmPurpose = Literal['explanation', 'report', 'assistant', 'news']
LlmSource = Literal['llm', 'template']


@dataclass(frozen=True)
class LlmRequest:
    purpose: LlmPurpose
    system_prompt: str
    user_prompt: str
    facts: dict[str, Any]
    max_tokens: int = 700
    temperature: float = 0.0
    timeout_ms: int = 15_000
    attempt: int = 0


@dataclass(frozen=True)
class LlmResponse:
    text: str
    model: str
    source: LlmSource
    latency_ms: int
    attempt: int = 0


class LlmError(Exception):
    """Base class for provider failures that must degrade to a template."""


class LlmUnavailableError(LlmError):
    """No key, no endpoint, or a non-retryable HTTP error."""


class LlmTimeoutError(LlmError):
    """Provider exceeded the configured wall-clock budget."""


class LlmProvider(Protocol):
    """Structural interface implemented by the adapter and the mock."""

    @property
    def model(self) -> str: ...

    @property
    def is_template(self) -> bool: ...

    def complete(self, request: LlmRequest) -> LlmResponse: ...


__all__ = [
    'LlmError',
    'LlmProvider',
    'LlmPurpose',
    'LlmRequest',
    'LlmResponse',
    'LlmSource',
    'LlmTimeoutError',
    'LlmUnavailableError',
]
