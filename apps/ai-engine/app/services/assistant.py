"""Retrieval-first grounded assistant (README §12.5).

Facts arrive from the Node API's DB/cache retrieval layer. If the retrieved
facts cannot answer the question, the only acceptable answer is an explicit
no-data response — never a plausible fabrication.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

from ..config import settings
from ..logging import get_logger
from ..schemas import AssistantFactInput, AssistantRequestV2
from .llm import (
    LlmError,
    LlmProvider,
    LlmRequest,
    SYSTEM_PROMPTS,
    MockLLM,
    build_user_prompt,
    default_provider,
    scrub_external_text,
)
from .validate_explanation import (
    ValidationContext,
    ValidationResult,
    payload_hash,
    validate_output,
)

LOGGER: logging.Logger = get_logger(__name__)
MAX_FACTS = 12


@dataclass(frozen=True)
class AssistantGeneration:
    answer: str
    sources: list[AssistantFactInput]
    grounded: bool
    has_data: bool
    source: str
    model: str
    attempts: int
    validation: ValidationResult
    payload_hash: str


def _question_symbols(message: str) -> set[str]:
    upper = message.upper()
    result: set[str] = set()
    for left in ('EUR', 'GBP', 'USD', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'):
        for right in ('EUR', 'GBP', 'USD', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'):
            if left != right and f'{left}/{right}' in upper:
                result.add(f'{left}/{right}')
    for token in ('EUR', 'GBP', 'USD', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'):
        if token in upper:
            result.add(token)
    return result


def select_facts(message: str, facts: list[AssistantFactInput]) -> list[AssistantFactInput]:
    """Choose only facts relevant to the question; never invent a substitute."""
    symbols = _question_symbols(message)
    if not symbols:
        return facts[:MAX_FACTS]
    selected = [fact for fact in facts if fact.symbol.upper() in symbols]
    return selected[:MAX_FACTS]


def _fact_strings(facts: list[AssistantFactInput]) -> list[str]:
    result: list[str] = []
    for fact in facts:
        symbol = scrub_external_text(fact.symbol).text
        label = scrub_external_text(fact.label).text
        value = scrub_external_text(fact.value).text
        if symbol and label and value:
            result.append(f'{symbol} {label}: {value}')
    return result


def build_facts(request: AssistantRequestV2, facts: list[AssistantFactInput]) -> dict[str, Any]:
    question = scrub_external_text(request.message).text
    rendered = _fact_strings(facts)
    return {
        'question': question,
        'facts': rendered,
        'hasData': bool(rendered),
    }


def generate_answer(
    request: AssistantRequestV2,
    provider: LlmProvider | None = None,
) -> AssistantGeneration:
    selected = provider or default_provider()
    question = scrub_external_text(request.message).text
    facts = select_facts(question, request.facts)
    fact_strings = _fact_strings(facts)
    has_data = bool(fact_strings)
    model_facts = build_facts(request, facts)
    context = ValidationContext(
        purpose='assistant',
        sources=tuple(fact_strings),
        has_data=has_data,
    )
    llm_request = LlmRequest(
        purpose='assistant',
        system_prompt=SYSTEM_PROMPTS['assistant'],
        user_prompt=build_user_prompt('assistant', model_facts),
        facts=model_facts,
        max_tokens=settings.AI_LLM_MAX_TOKENS,
        temperature=settings.AI_LLM_TEMPERATURE,
        timeout_ms=settings.AI_LLM_TIMEOUT_MS,
    )

    started = time.perf_counter()
    attempts = 0
    validation = ValidationResult(False, ('no generation attempt',))
    text = ''
    source = 'template'
    model = 'template-v1'
    fallback_reason: str | None = None
    for attempt in range(2):
        attempts = attempt + 1
        try:
            response = selected.complete(
                LlmRequest(**{**llm_request.__dict__, 'attempt': attempt})
            )
        except LlmError as exc:
            fallback_reason = f'provider failure: {exc}'
            break
        text = response.text
        source = response.source
        model = response.model
        validation = validate_output(text, context)
        if validation.valid or selected.is_template:
            break

    if not validation.valid:
        fallback_reason = '; '.join(validation.violations) or fallback_reason or 'provider failure'
        fallback = MockLLM().complete(llm_request)
        text = fallback.text
        source = fallback.source
        model = fallback.model
        validation = validate_output(text, context)

    result = AssistantGeneration(
        answer=text,
        sources=facts,
        grounded=validation.valid,
        has_data=has_data,
        source=source,
        model=model,
        attempts=attempts,
        validation=validation,
        payload_hash=payload_hash(context),
    )
    LOGGER.info(
        'assistant answered',
        extra={
            'explanationSource': result.source,
            'llmModel': result.model,
            'payloadHash': result.payload_hash,
            'latencyMs': int((time.perf_counter() - started) * 1000),
            'attempts': result.attempts,
            'grounded': result.grounded,
            'hasData': result.has_data,
            'valid': result.validation.valid,
            'violations': list(result.validation.violations),
            'fallbackReason': fallback_reason,
        },
    )
    return result


__all__ = ['AssistantGeneration', 'build_facts', 'generate_answer', 'select_facts']
