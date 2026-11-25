"""Optional LLM enhancer for P11 news classification.

The enhancer never invents a new schema: it returns the same structured
classification as the rule-based path and falls back to that path whenever the
LLM is absent, slow, or produces an out-of-vocabulary label.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from ..config import settings
from ..logging import get_logger
from ..schemas import NewsEnhancerRequest, NewsEnhancerResponse
from .llm import (
    LlmError,
    LlmProvider,
    LlmRequest,
    SYSTEM_PROMPTS,
    build_user_prompt,
    default_provider,
    scrub_external_text,
)
from .validate_explanation import ValidationContext, payload_hash, validate_output

LOGGER: logging.Logger = get_logger(__name__)
EVENT_TYPES = (
    'INTEREST_RATES', 'INFLATION', 'GDP', 'EMPLOYMENT', 'CENTRAL_BANK',
    'GOVERNMENT_POLICY', 'GEOPOLITICAL', 'ECONOMIC_RELEASE',
)
SENTIMENTS = ('BULLISH', 'BEARISH', 'NEUTRAL')
IMPACTS = ('LOW', 'MEDIUM', 'HIGH', 'EXTREME')


def _rule_result(rule: dict[str, Any]) -> NewsEnhancerResponse:
    sentiment = str(rule.get('sentiment', 'NEUTRAL')).upper()
    impact = str(rule.get('impact', 'LOW')).upper()
    event_type = str(rule.get('eventType', 'ECONOMIC_RELEASE')).upper()
    confidence = rule.get('confidence', 0.5)
    return NewsEnhancerResponse(
        eventType=event_type if event_type in EVENT_TYPES else 'ECONOMIC_RELEASE',
        sentiment=sentiment if sentiment in SENTIMENTS else 'NEUTRAL',
        impact=impact if impact in IMPACTS else 'LOW',
        confidence=float(confidence) if isinstance(confidence, (int, float)) else 0.5,
        analyzedBy='lexicon-v1',
    )


def _audit(
    context: ValidationContext,
    model: str,
    latency_ms: int,
    valid: bool,
    fallback: bool,
) -> None:
    LOGGER.info(
        'news classification generated',
        extra={
            'explanationSource': 'template' if fallback else 'llm',
            'llmModel': model,
            'payloadHash': payload_hash(context),
            'latencyMs': latency_ms,
            'attempts': 1,
            'valid': valid,
            'usedRuleFallback': fallback,
        },
    )


def enhance_news(
    request: NewsEnhancerRequest,
    provider: LlmProvider | None = None,
) -> NewsEnhancerResponse:
    rule = dict(request.ruleClassification)
    fallback = _rule_result(rule)
    selected = provider or default_provider()
    if selected.is_template:
        return fallback

    title = scrub_external_text(request.title).text
    text = scrub_external_text(request.text).text
    facts: dict[str, Any] = {
        'title': title,
        'text': text,
        'affectedPairs': [scrub_external_text(item).text for item in request.affectedPairs or []],
        'ruleClassification': fallback.model_dump(),
        'allowedEventType': EVENT_TYPES,
        'allowedSentiment': SENTIMENTS,
        'allowedImpact': IMPACTS,
    }
    context = ValidationContext(
        purpose='news',
        payload=fallback.model_dump(),
        sources=(title, text),
    )
    llm_request = LlmRequest(
        purpose='news',
        system_prompt=SYSTEM_PROMPTS['news'],
        user_prompt=build_user_prompt('news', facts),
        facts=facts,
        max_tokens=settings.AI_LLM_MAX_TOKENS,
        temperature=settings.AI_LLM_TEMPERATURE,
        timeout_ms=settings.AI_LLM_TIMEOUT_MS,
    )
    started = time.perf_counter()
    try:
        response = selected.complete(llm_request)
        validation = validate_output(response.text, context)
        if not validation.valid:
            _audit(context, selected.model, response.latency_ms, False, True)
            return fallback
        parsed = json.loads(response.text)
    except (LlmError, ValueError, json.JSONDecodeError):
        _audit(context, selected.model, int((time.perf_counter() - started) * 1000), False, True)
        return fallback

    if (
        parsed.get('eventType') not in EVENT_TYPES
        or parsed.get('sentiment') not in SENTIMENTS
        or parsed.get('impact') not in IMPACTS
    ):
        _audit(context, selected.model, response.latency_ms, False, True)
        return fallback
    confidence = parsed.get('confidence')
    if not isinstance(confidence, (int, float)) or not 0 <= float(confidence) <= 1:
        _audit(context, selected.model, response.latency_ms, False, True)
        return fallback
    _audit(context, selected.model, response.latency_ms, True, False)
    return NewsEnhancerResponse(
        eventType=parsed['eventType'],
        sentiment=parsed['sentiment'],
        impact=parsed['impact'],
        confidence=float(confidence),
        analyzedBy=selected.model,
    )


__all__ = ['EVENT_TYPES', 'IMPACTS', 'SENTIMENTS', 'enhance_news']
