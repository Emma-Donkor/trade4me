"""Post-generation grounding validator.

This is the integrity gate of Phase 17. A generated string is accepted only if
every number, symbol, category and indicator it mentions can be traced back to
the verified structured payload (or to evidence that came from the deterministic
pipeline). Anything else is a fabrication and triggers regeneration or the
deterministic template fallback.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from .llm import NO_DATA_ANSWER, encode_facts
from .llm.sanitization import INJECTION_PATTERNS

SAFE_NUMBERS = frozenset({'100'})
CURRENCY_CODES = frozenset(
    {
        'AUD', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'HKD', 'INR', 'JPY', 'NZD',
        'SEK', 'SGD', 'USD', 'ZAR', 'XAU', 'XAG',
    }
)
INDICATOR_NAMES = (
    'RSI', 'EMA', 'SMA', 'MACD', 'ATR', 'ADX', 'BOLLINGER', 'STOCHASTIC',
    'FIBONACCI', 'PIVOT', 'VWAP', 'ICHIMOKU', 'CCI', 'WILLIAMS',
)
RISK_LEVELS = ('LOW', 'MEDIUM', 'HIGH', 'EXTREME')
REGIMES = (
    'STRONG_UPTREND', 'WEAK_UPTREND', 'RANGE', 'WEAK_DOWNTREND',
    'STRONG_DOWNTREND', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'UNCERTAIN',
)
ACTIONS = ('LONG', 'SHORT', 'WATCH', 'NO_TRADE')
NUMBER_PATTERN = re.compile(r'(\d+(?:[.,]\d+)*)')
PAIR_PATTERN = re.compile(r'\b[A-Z]{3}/[A-Z]{3}\b')
CODE_PATTERN = re.compile(r'\b[A-Z]{3}\b')
STRUCTURE_LINES = (
    'Probability:',
    'Confidence:',
    'Risk:',
    'Data freshness:',
    'Model:',
    'Timestamp:',
)
EXPLANATION_HEADERS = ('DECISION', 'SUPPORTING', 'CONTRADICTING', 'FINAL')


@dataclass(frozen=True)
class ValidationContext:
    purpose: str
    payload: dict[str, Any] | None = None
    decision: str = ''
    sources: tuple[str, ...] = ()
    timestamp: str = ''
    scenarios: tuple[dict[str, Any], ...] = ()
    has_data: bool = True


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    violations: tuple[str, ...] = ()

    def __bool__(self) -> bool:
        return self.valid


def _canonical_numbers(text: object) -> set[str]:
    numbers: set[str] = set()
    for match in NUMBER_PATTERN.findall(str(text)):
        normalised = match.replace(',', '.')
        try:
            value = Decimal(normalised)
        except InvalidOperation:
            continue
        if value == value.to_integral_value():
            numbers.add(str(int(value)))
        else:
            numbers.add(format(value.normalize(), 'f'))
    return numbers


def allowed_numbers(context: ValidationContext) -> set[str]:
    allowed = set(SAFE_NUMBERS)
    if context.payload:
        for key, value in context.payload.items():
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                continue
            allowed |= _canonical_numbers(value)
            if key == 'modelProbability':
                allowed.add(str(round(float(value) * 100)))
            if key == 'confidence' and float(value) <= 1:
                allowed.add(str(round(float(value) * 100)))
    for source in context.sources:
        allowed |= _canonical_numbers(source)
    allowed |= _canonical_numbers(context.decision)
    allowed |= _canonical_numbers(context.timestamp)
    for scenario in context.scenarios:
        allowed |= _canonical_numbers(scenario.get('probability', 0))
    return allowed


def allowed_symbols(context: ValidationContext) -> set[str]:
    symbols: set[str] = set()
    combined = ' '.join((context.decision, *context.sources))
    symbols.update(PAIR_PATTERN.findall(combined))
    symbols.update(code for code in CODE_PATTERN.findall(combined) if code in CURRENCY_CODES)
    if context.payload and isinstance(context.payload.get('symbol'), str):
        symbols.add(context.payload['symbol'])
    return symbols


def allowed_indicators(context: ValidationContext) -> set[str]:
    combined = ' '.join((context.decision, *context.sources)).upper()
    return {name for name in INDICATOR_NAMES if name in combined}


def payload_hash(context: ValidationContext) -> str:
    """Stable hash over the exact verified facts used to obtain an explanation."""
    canonical = encode_facts(
        {
            'payload': context.payload or {},
            'decision': context.decision,
            'sources': list(context.sources),
            'timestamp': context.timestamp,
        }
    )
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


def validate_output(text: str, context: ValidationContext) -> ValidationResult:
    """Return one result with every violation found; no exceptions escape."""
    if not isinstance(text, str) or not text.strip():
        return ValidationResult(False, ('empty output',))
    violations: list[str] = []
    numbers = allowed_numbers(context)
    symbols = allowed_symbols(context)
    indicators = allowed_indicators(context)

    found_numbers = _canonical_numbers(text)
    forbidden_numbers = sorted(found_numbers - numbers)
    if forbidden_numbers:
        violations.append(f'unverified numbers: {", ".join(forbidden_numbers)}')

    for symbol in sorted(set(PAIR_PATTERN.findall(text))):
        if symbol not in symbols:
            violations.append(f'unverified symbol: {symbol}')
    for code in sorted(set(CODE_PATTERN.findall(text))):
        if code in CURRENCY_CODES and code not in symbols:
            violations.append(f'unverified currency: {code}')

    upper = text.upper()
    for indicator in INDICATOR_NAMES:
        if re.search(rf'\b{indicator}\b', upper) and indicator not in indicators:
            violations.append(f'unverified indicator: {indicator}')
    for risk in RISK_LEVELS:
        if re.search(rf'\b{risk}\b', upper) and context.payload and risk != str(
            context.payload.get('risk', '')
        ).upper():
            violations.append(f'unverified risk level: {risk}')
    for regime in REGIMES:
        if re.search(rf'\b{regime}\b', upper) and context.payload and regime != str(
            context.payload.get('marketRegime', '')
        ).upper():
            violations.append(f'unverified market regime: {regime}')
    allowed_actions = {
        action
        for action in ACTIONS
        if re.search(rf'\b{action}\b', f'{context.decision} {" ".join(context.sources)}'.upper())
    }
    for action in ACTIONS:
        if action not in allowed_actions and re.search(rf'\b{action}\b', upper):
            violations.append(f'unverified action: {action}')

    for pattern in INJECTION_PATTERNS:
        if pattern.search(text):
            violations.append('instruction-shaped text in output')
            break
    if 'as an ai' in text.lower() or 'system prompt' in text.lower():
        violations.append('meta-instruction text in output')

    if context.purpose == 'explanation':
        for header in EXPLANATION_HEADERS:
            if not re.search(rf'^\s*{header}\s*$', text, re.MULTILINE):
                violations.append(f'missing section: {header}')
        for line in STRUCTURE_LINES:
            if not re.search(rf'^\s*{re.escape(line)}', text, re.MULTILINE):
                violations.append(f'missing field: {line}')
    elif context.purpose == 'report':
        if 'probabilit' not in text.lower():
            violations.append('scenarios are not labeled as probabilities')
        for scenario in context.scenarios:
            label = str(scenario.get('label', ''))
            probability = str(scenario.get('probability', ''))
            if label and not re.search(rf'{re.escape(label)}[^\n]*{re.escape(probability)}%', text):
                violations.append(f'scenario mismatch: {label} {probability}%')
    elif context.purpose == 'assistant':
        if not context.has_data:
            if text.strip() != NO_DATA_ANSWER:
                violations.append('missing-data answer was not explicit')
        elif not any(term and term in text for term in context.sources):
            violations.append('answer does not cite retrieved facts')
    elif context.purpose == 'news':
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            violations.append('news classification is not JSON')
            parsed = {}
        expected = {'eventType', 'sentiment', 'impact', 'confidence', 'analyzedBy'}
        if not isinstance(parsed, dict) or set(parsed) != expected:
            violations.append('news classification keys do not match NewsAnalysis')

    # De-duplicate while preserving order for deterministic audit output.
    return ValidationResult(not violations, tuple(dict.fromkeys(violations)))


__all__ = [
    'ACTIONS',
    'CURRENCY_CODES',
    'INDICATOR_NAMES',
    'REGIMES',
    'RISK_LEVELS',
    'ValidationContext',
    'ValidationResult',
    'allowed_indicators',
    'allowed_numbers',
    'allowed_symbols',
    'payload_hash',
    'validate_output',
]
