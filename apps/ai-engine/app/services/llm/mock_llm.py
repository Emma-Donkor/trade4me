"""Deterministic, keyless template renderer.

``MockLLM`` is a real provider, not a stub: with no API key it renders every
product surface from the verified payload. The same payload always produces
the same string, which keeps the whole platform functional offline and makes
grounding tests trivial to reason about.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any

from .base import LlmRequest, LlmResponse
from .sanitization import scrub_external_text

TEMPLATE_MODEL = 'template-v1'
NO_DATA_ANSWER = 'I do not have application data for that question yet.'
SCENARIO_LABELS = ('Bullish', 'Neutral', 'Bearish')


def _number(value: Any) -> str:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return '0'
    if isinstance(value, int) or float(value).is_integer():
        return str(int(value))
    return f'{value:.4g}'


def _bullets(items: object) -> list[str]:
    if not isinstance(items, (list, tuple)):
        return []
    result: list[str] = []
    for raw in items:
        cleaned = scrub_external_text(raw).text
        if cleaned:
            result.append(f'• {cleaned}')
    return result or ['• No verified evidence available']


def _timestamp(value: Any) -> str:
    text = str(value or '').strip()
    match = re.match(r'(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})', text)
    if match:
        return f'{match.group(1)} {match.group(2)} UTC'
    return text.replace('Z', ' UTC')


def render_explanation(facts: dict[str, Any]) -> str:
    payload = facts.get('payload') if isinstance(facts.get('payload'), dict) else {}
    decision = scrub_external_text(facts.get('decision')).text or 'WATCH'
    final = scrub_external_text(facts.get('final')).text or decision
    supporting = _bullets(facts.get('supporting'))
    contradicting = _bullets(facts.get('contradicting'))
    probability = _number(facts.get('probabilityPercent'))
    confidence = _number(facts.get('confidence'))
    risk = payload.get('risk', 'LOW')
    freshness = _number(payload.get('dataFreshnessSeconds'))
    model = payload.get('modelVersion', 'template')
    timestamp = _timestamp(facts.get('timestamp'))

    return '\n'.join(
        [
            'DECISION',
            decision,
            '',
            'SUPPORTING',
            *supporting,
            '',
            'CONTRADICTING',
            *contradicting,
            '',
            'FINAL',
            final,
            '',
            f'Probability: {probability}%',
            f'Confidence: {confidence}/100',
            f'Risk: {risk}',
            f'Data freshness: {freshness}s',
            f'Model: {model}',
            f'Timestamp: {timestamp}',
        ]
    )


def render_report(facts: dict[str, Any]) -> str:
    symbol = scrub_external_text(facts.get('symbol')).text or 'UNKNOWN'
    summary = scrub_external_text(facts.get('summary')).text or 'No verified summary available.'
    trend = scrub_external_text(facts.get('trend')).text or 'No verified trend available.'
    decision = scrub_external_text(facts.get('decision')).text or 'WATCH'
    scenarios = (
        facts.get('scenarios') if isinstance(facts.get('scenarios'), list) else []
    )
    scenario_lines: list[str] = []
    for scenario in scenarios:
        if not isinstance(scenario, dict):
            continue
        label = scrub_external_text(scenario.get('label')).text
        probability = _number(scenario.get('probability'))
        if label:
            scenario_lines.append(f'{label} — {probability}% (probability)')
    if not scenario_lines:
        scenario_lines = [f'{label} — 0% (probability)' for label in SCENARIO_LABELS]
    reasons = _bullets(facts.get('reasons'))
    warnings = _bullets(facts.get('warnings'))
    evidence_lines = [
        f'TECHNICAL EVIDENCE: {"; ".join(_bullets(facts.get("technicalEvidence")))}',
        f'HISTORICAL EVIDENCE: {"; ".join(_bullets(facts.get("historicalEvidence")))}',
        f'NEWS EVIDENCE: {"; ".join(_bullets(facts.get("newsEvidence")))}',
    ]
    return '\n'.join(
        [
            f'MARKET REPORT {symbol}',
            f'SUMMARY: {summary}',
            f'TREND: {trend}',
            *evidence_lines,
            'SCENARIO ANALYSIS (probabilities, not certainties)',
            *scenario_lines,
            f'DECISION: {decision}',
            'REASONS:',
            *reasons,
            'WARNINGS:',
            *warnings,
        ]
    )


def render_assistant(facts: dict[str, Any]) -> str:
    if not facts.get('hasData'):
        return NO_DATA_ANSWER
    items = facts.get('facts') if isinstance(facts.get('facts'), list) else []
    lines = ['Based on application data:']
    for item in items[:12]:
        if isinstance(item, dict):
            symbol = scrub_external_text(item.get('symbol')).text
            label = scrub_external_text(item.get('label')).text
            value = scrub_external_text(item.get('value')).text
            rendered = f'{symbol} {label}: {value}'.strip()
        else:
            rendered = scrub_external_text(item).text
        if rendered:
            lines.append(f'• {rendered}')
    if len(lines) == 1:
        return NO_DATA_ANSWER
    lines.append('I have not added any information beyond these application facts.')
    return '\n'.join(lines)


def render_news(facts: dict[str, Any]) -> str:
    rule = facts.get('ruleClassification') if isinstance(facts.get('ruleClassification'), dict) else {}
    return json.dumps(
        {
            'eventType': rule.get('eventType', 'ECONOMIC_RELEASE'),
            'sentiment': rule.get('sentiment', 'NEUTRAL'),
            'impact': rule.get('impact', 'LOW'),
            'confidence': rule.get('confidence', 0.5),
            'analyzedBy': 'news-llm-template-v1',
        },
        sort_keys=True,
    )


RENDERERS = {
    'explanation': render_explanation,
    'report': render_report,
    'assistant': render_assistant,
    'news': render_news,
}


class MockLLM:
    """Provider that renders templates without any network call or key."""

    def __init__(self) -> None:
        self.model = TEMPLATE_MODEL
        self.is_template = True

    def complete(self, request: LlmRequest) -> LlmResponse:
        started = time.perf_counter()
        renderer = RENDERERS.get(request.purpose)
        if renderer is None:
            raise ValueError(f'Unsupported template purpose: {request.purpose}')
        return LlmResponse(
            text=renderer(request.facts),
            model=self.model,
            source='template',
            latency_ms=int((time.perf_counter() - started) * 1000),
            attempt=request.attempt,
        )


__all__ = [
    'MockLLM',
    'NO_DATA_ANSWER',
    'SCENARIO_LABELS',
    'TEMPLATE_MODEL',
    'render_assistant',
    'render_explanation',
    'render_news',
    'render_report',
]
