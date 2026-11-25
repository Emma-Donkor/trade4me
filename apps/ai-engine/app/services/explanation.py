"""Grounded explanation engine (README §12.2/§12.3).

The engine consumes a verified structured payload only. A language model may
reword it; it may never introduce a fact. Validation happens before anything
leaves this module and failures degrade to the deterministic template.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

from ..config import settings
from ..logging import get_logger
from ..schemas import ExplanationRequestV2, ExplainFactor
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
MAX_GENERATION_ATTEMPTS = 2


@dataclass(frozen=True)
class ExplanationGeneration:
    text: str
    source: str
    model: str
    latency_ms: int
    attempts: int
    validation: ValidationResult
    payload_hash: str
    summary: str
    factors: list[ExplainFactor]
    fallback_reason: str | None = None


def _string_evidence(items: Any) -> list[str]:
    result: list[str] = []
    for item in items or []:
        source = scrub_external_text(getattr(item, 'source', '')).text
        claim = scrub_external_text(getattr(item, 'claim', '')).text
        if source and claim:
            result.append(f'{source}: {claim}')
        elif claim:
            result.append(claim)
    return result or ['No verified evidence available']


def _factors(items: Any) -> list[ExplainFactor]:
    factors: list[ExplainFactor] = []
    for item in items or []:
        raw = getattr(item, 'value', None)
        try:
            impact = float(raw) if raw is not None else 0.0
        except (TypeError, ValueError):
            impact = 0.0
        factors.append(
            ExplainFactor(
                name=scrub_external_text(getattr(item, 'source', 'evidence')).text or 'evidence',
                impact=impact,
            )
        )
    return factors[:12]


def build_facts(request: ExplanationRequestV2) -> dict[str, Any]:
    """All facts given to the model; every value comes from the caller's payload."""
    payload = request.payload.model_dump()
    supporting = _string_evidence(request.supportingEvidence)
    contradicting = _string_evidence(request.contradictingEvidence)
    return {
        'payload': payload,
        'decision': scrub_external_text(request.decision).text,
        'supporting': supporting,
        'contradicting': contradicting,
        'reasons': [scrub_external_text(item).text for item in request.reasons],
        'noTradeReasons': [scrub_external_text(item).text for item in request.noTradeReasons],
        'probabilityPercent': round(float(payload['modelProbability']) * 100),
        'confidence': round(float(payload['confidence'])),
        'final': scrub_external_text(request.decision).text,
        'timestamp': request.timestamp,
    }


def build_context(request: ExplanationRequestV2) -> ValidationContext:
    facts = build_facts(request)
    sources = tuple(facts['supporting'] + facts['contradicting'] + facts['reasons'])
    return ValidationContext(
        purpose='explanation',
        payload=request.payload.model_dump(),
        decision=str(facts['decision']),
        sources=sources,
        timestamp=request.timestamp,
    )


def _summary(text: str, decision: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) > 1 and lines[0] == 'DECISION':
        return lines[1]
    return decision


def generate_explanation(
    request: ExplanationRequestV2,
    provider: LlmProvider | None = None,
) -> ExplanationGeneration:
    """Generate and validate one explanation, with a single regeneration allowance."""
    selected = provider or default_provider()
    facts = build_facts(request)
    context = build_context(request)
    llm_request = LlmRequest(
        purpose='explanation',
        system_prompt=SYSTEM_PROMPTS['explanation'],
        user_prompt=build_user_prompt('explanation', facts),
        facts=facts,
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
    latency_ms = 0

    for attempt in range(MAX_GENERATION_ATTEMPTS):
        attempts = attempt + 1
        current = LlmRequest(**{**llm_request.__dict__, 'attempt': attempt})
        try:
            response = selected.complete(current)
        except LlmError as exc:
            latency_ms = int((time.perf_counter() - started) * 1000)
            validation = ValidationResult(False, (f'provider failure: {exc}',))
            break
        text = response.text
        source = response.source
        model = response.model
        latency_ms = response.latency_ms
        validation = validate_output(text, context)
        if validation.valid:
            break
        if selected.is_template:
            break

    fallback_reason: str | None = None
    if not validation.valid:
        fallback_reason = '; '.join(validation.violations) or 'provider failure'
        fallback = MockLLM().complete(llm_request)
        text = fallback.text
        source = fallback.source
        model = fallback.model
        latency_ms = fallback.latency_ms
        validation = validate_output(text, context)

    result = ExplanationGeneration(
        text=text,
        source=source,
        model=model,
        latency_ms=latency_ms,
        attempts=attempts,
        validation=validation,
        payload_hash=payload_hash(context),
        summary=_summary(text, facts['decision']),
        factors=_factors(request.supportingEvidence),
        fallback_reason=fallback_reason,
    )
    LOGGER.info(
        'explanation generated',
        extra={
            'symbol': facts['payload'].get('symbol'),
            'predictionId': request.predictionId,
            'explanationSource': result.source,
            'llmModel': result.model,
            'payloadHash': result.payload_hash,
            'latencyMs': result.latency_ms,
            'attempts': result.attempts,
            'valid': result.validation.valid,
            'violations': list(result.validation.violations),
            'fallbackReason': result.fallback_reason,
        },
    )
    return result


__all__ = [
    'ExplanationGeneration',
    'build_context',
    'build_facts',
    'generate_explanation',
]
