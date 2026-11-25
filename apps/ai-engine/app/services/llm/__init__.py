"""LLM provider abstraction used by every P17 narration service."""

from .base import (
    LlmError,
    LlmProvider,
    LlmPurpose,
    LlmRequest,
    LlmResponse,
    LlmSource,
    LlmTimeoutError,
    LlmUnavailableError,
)
from .mock_llm import MockLLM, NO_DATA_ANSWER
from .openai_adapter import OpenAIAdapter
from .prompts import SYSTEM_PROMPTS, build_user_prompt, encode_facts
from .provider import default_provider
from .sanitization import ScrubbedText, scrub_external_text

__all__ = [
    'LlmError',
    'LlmProvider',
    'LlmPurpose',
    'LlmRequest',
    'LlmResponse',
    'LlmSource',
    'LlmTimeoutError',
    'LlmUnavailableError',
    'MockLLM',
    'NO_DATA_ANSWER',
    'OpenAIAdapter',
    'SYSTEM_PROMPTS',
    'ScrubbedText',
    'build_user_prompt',
    'default_provider',
    'encode_facts',
    'scrub_external_text',
]
