"""AI market report generation (README §12.4).

Scenarios are computed from calibrated model outputs by deterministic integer
arithmetic, never by the language model. The LLM may only narrate those exact
percentages, and the validator rejects any other number.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from typing import Any

from ..config import settings
from ..logging import get_logger
from ..schemas import ReportRequest, ReportScenario
from .explanation import _string_evidence
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


@dataclass(frozen=True)
class ReportGeneration:
    text: str
    source: str
    model: str
    attempts: int
    validation: ValidationResult
    payload_hash: str
    scenarios: list[ReportScenario]


def scenario_split(request: ReportRequest) -> list[ReportScenario]:
    """Bullish/neutral/bearish integer probabilities that always sum to 100."""
    prediction = request.prediction
    if prediction is None:
        return [
            ReportScenario(label='Bullish', probability=34),
            ReportScenario(label='Neutral', probability=33),
            ReportScenario(label='Bearish', probability=33),
        ]
    p = max(0.0, min(1.0, float(prediction.probability)))
    certain = round(p * 100)
    remainder = 100 - certain
    if prediction.direction == 'LONG':
        bullish = certain
        bearish = round(remainder * 0.6)
        neutral = 100 - bullish - bearish
    elif prediction.direction == 'SHORT':
        bearish = certain
        bullish = round(remainder * 0.6)
        neutral = 100 - bearish - bullish
    else:
        neutral = certain
        bullish = remainder // 2
        bearish = 100 - neutral - bullish
    return [
        ReportScenario(label='Bullish', probability=bullish),
        ReportScenario(label='Neutral', probability=neutral),
        ReportScenario(label='Bearish', probability=bearish),
    ]


def _evidence_strings(items: Any) -> list[str]:
    return _string_evidence(items)


def build_facts(request: ReportRequest, scenarios: list[ReportScenario]) -> dict[str, Any]:
    return {
        'symbol': scrub_external_text(request.symbol).text,
        'summary': scrub_external_text(request.summary).text,
        'trend': scrub_external_text(request.trend).text,
        'technicalEvidence': _evidence_strings(request.technicalEvidence),
        'historicalEvidence': _evidence_strings(request.historicalEvidence),
        'newsEvidence': _evidence_strings(request.newsEvidence),
        'prediction': request.prediction.model_dump() if request.prediction else None,
        'risk': request.risk.model_dump() if request.risk else None,
        'decision': scrub_external_text(request.decision).text,
        'reasons': [scrub_external_text(item).text for item in request.reasons],
        'warnings': [scrub_external_text(item).text for item in request.warnings],
        'scenarios': [scenario.model_dump() for scenario in scenarios],
        'asOf': request.asOf,
    }


def build_context(request: ReportRequest, scenarios: list[ReportScenario]) -> ValidationContext:
    facts = build_facts(request, scenarios)
    sources = tuple(
        facts['technicalEvidence']
        + facts['historicalEvidence']
        + facts['newsEvidence']
        + facts['reasons']
        + facts['warnings']
        + [facts['summary'], facts['trend'], facts['decision']]
    )
    return ValidationContext(
        purpose='report',
        decision=facts['decision'],
        sources=sources,
        timestamp=request.asOf,
        scenarios=tuple(scenario.model_dump() for scenario in scenarios),
    )


def generate_report(
    request: ReportRequest,
    provider: LlmProvider | None = None,
) -> ReportGeneration:
    selected = provider or default_provider()
    scenarios = scenario_split(request)
    facts = build_facts(request, scenarios)
    context = build_context(request, scenarios)
    llm_request = LlmRequest(
        purpose='report',
        system_prompt=SYSTEM_PROMPTS['report'],
        user_prompt=build_user_prompt('report', facts),
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

    result = ReportGeneration(
        text=text,
        source=source,
        model=model,
        attempts=attempts,
        validation=validation,
        payload_hash=payload_hash(context),
        scenarios=scenarios,
    )
    LOGGER.info(
        'report generated',
        extra={
            'symbol': facts['symbol'],
            'explanationSource': result.source,
            'llmModel': result.model,
            'payloadHash': result.payload_hash,
            'latencyMs': int((time.perf_counter() - started) * 1000),
            'attempts': result.attempts,
            'valid': result.validation.valid,
            'violations': list(result.validation.violations),
            'fallbackReason': fallback_reason,
        },
    )
    return result


def summary_of(text: str) -> str:
    match = re.search(r'^SUMMARY:\s*(.+)$', text, re.MULTILINE)
    return match.group(1).strip() if match else ''


__all__ = ['ReportGeneration', 'build_context', 'build_facts', 'generate_report', 'scenario_split']
