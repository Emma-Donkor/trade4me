"""Report scenarios and the assistant's no-fabrication guarantee."""

from __future__ import annotations

import logging

from app.schemas import (
    AssistantFactInput,
    AssistantRequestV2,
    ReportPredictionSnapshot,
    ReportRequest,
)
from app.services.assistant import generate_answer
from app.services.llm import MockLLM
from app.services.report import generate_report, scenario_split

REPORT = {
    'symbol': 'EUR/USD',
    'asOf': '2026-10-08T09:30:00.000Z',
    'summary': 'EUR/USD is in a confirmed uptrend.',
    'trend': 'Positive momentum across timeframes.',
    'technicalEvidence': [{'source': 'technical', 'claim': 'Price above EMA50'}],
    'historicalEvidence': [{'source': 'historical', 'claim': '67% similarity-class win rate'}],
    'newsEvidence': [{'source': 'news', 'claim': 'Positive news sentiment'}],
    'prediction': {
        'direction': 'LONG',
        'probability': 0.61,
        'confidence': 74,
        'riskLevel': 'MEDIUM',
        'modelVersion': 'xgboost-v1.4.2',
    },
    'risk': {'level': 'MEDIUM', 'reasons': ['Elevated volatility'], 'riskReward': 2.1},
    'decision': 'Potential Long',
    'reasons': ['technical: Price above EMA50'],
    'warnings': ['High-impact economic event'],
}


def report_request(direction: str = 'LONG', probability: float = 0.61) -> ReportRequest:
    payload = dict(REPORT)
    if direction == 'NONE':
        payload['prediction'] = None
    else:
        payload['prediction'] = {**REPORT['prediction'], 'direction': direction, 'probability': probability}
    return ReportRequest.model_validate(payload)


def test_scenario_probabilities_always_sum_to_one_hundred() -> None:
    for direction, probability in (
        ('LONG', 0.61),
        ('SHORT', 0.73),
        ('NEUTRAL', 0.44),
        ('NONE', 0.0),
    ):
        split = scenario_split(report_request(direction, probability))
        assert [item.label for item in split] == ['Bullish', 'Neutral', 'Bearish']
        assert sum(item.probability for item in split) == 100
        assert all(0 <= item.probability <= 100 for item in split)


def test_report_text_is_grounded_and_labels_probabilities() -> None:
    result = generate_report(report_request(), MockLLM())
    assert sum(item.probability for item in result.scenarios) == 100
    assert result.validation.valid, result.validation.violations
    assert '(probability)' in result.text
    assert 'SCENARIO ANALYSIS' in result.text
    assert '73' not in result.text.replace('2026', '').replace('0.73', '')
    for scenario in result.scenarios:
        assert f'{scenario.label} — {scenario.probability}%' in result.text


def test_report_prediction_model_is_the_only_probability_source() -> None:
    prediction = ReportPredictionSnapshot.model_validate(REPORT['prediction'])
    split = scenario_split(report_request('LONG', 0.61))
    assert split[0].probability == round(prediction.probability * 100)


def test_assistant_reports_missing_data_explicitly() -> None:
    request = AssistantRequestV2.model_validate(
        {'message': 'What is the price of EUR/USD right now?', 'facts': []}
    )
    result = generate_answer(request, MockLLM())
    assert result.has_data is False
    assert result.grounded is True
    assert result.answer == 'I do not have application data for that question yet.'
    assert result.sources == []


def test_assistant_uses_only_retrieved_facts() -> None:
    fact = AssistantFactInput(
        kind='SIGNAL',
        symbol='EUR/USD',
        label='Decision',
        value='Potential Long at a score of 82',
    )
    request = AssistantRequestV2.model_validate(
        {'message': 'Why is EUR/USD promising?', 'facts': [fact.model_dump()]}
    )
    result = generate_answer(request, MockLLM())
    assert result.has_data is True
    assert result.grounded is True
    assert 'EUR/USD Decision: Potential Long at a score of 82' in result.answer
    assert '1.9999' not in result.answer
    assert result.sources == [fact]


def test_assistant_ignores_facts_for_unasked_pairs() -> None:
    fact = AssistantFactInput(
        kind='SIGNAL', symbol='GBP/USD', label='Decision', value='Watch'
    )
    request = AssistantRequestV2.model_validate(
        {'message': 'What about EUR/USD?', 'facts': [fact.model_dump()]}
    )
    result = generate_answer(request, MockLLM())
    assert result.has_data is False
    assert result.answer == 'I do not have application data for that question yet.'


def test_generations_emit_payload_model_and_latency_audit(caplog) -> None:
    with caplog.at_level(logging.INFO):
        report = generate_report(report_request(), MockLLM())
        assistant_request = AssistantRequestV2.model_validate(
            {'message': 'Why is EUR/USD promising?', 'facts': []}
        )
        assistant = generate_answer(assistant_request, MockLLM())

    report_logs = [record for record in caplog.records if record.msg == 'report generated']
    assert any(
        getattr(record, 'payloadHash') == report.payload_hash
        and getattr(record, 'llmModel') == report.model
        and isinstance(getattr(record, 'latencyMs'), int)
        for record in report_logs
    )

    assistant_logs = [record for record in caplog.records if record.msg == 'assistant answered']
    assert any(
        getattr(record, 'payloadHash') == assistant.payload_hash
        and getattr(record, 'llmModel') == assistant.model
        and isinstance(getattr(record, 'latencyMs'), int)
        for record in assistant_logs
    )
