"""Prompt-injection scrubbing for every piece of external text (README §11/§12).

External text is *data*. Markup is removed, instruction-shaped phrases become
the inert literal ``[redacted]``, and the result is length-capped. The returned
safety marker is machine-readable so callers can record that an attempt was
seen without ever letting the text reach a system instruction.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

MAX_EXTERNAL_CHARS = 4000
REDACTION = '[redacted]'

# Each pattern is deliberately narrow: ordinary market commentary such as
# "the Fed's instructions were clear" must survive unchanged.
INJECTION_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r'ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|earlier|above|preceding)\s+'
        r'(?:instructions?|prompts?|rules?|messages?|directives?)',
        r'disregard\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|earlier|above|preceding)\s+'
        r'(?:instructions?|prompts?|rules?|messages?|directives?)',
        r'forget\s+(?:all\s+|everything\s+)?(?:you\s+)?(?:were\s+)?(?:told|instructed)',
        r'you\s+are\s+now\s+[a-z0-9_\- ]{2,40}',
        r'(?:system|developer|assistant)\s+prompt\s*(?:is|:|=|says)?',
        r'reveal\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|rules?)',
        r'act\s+as\s+(?:a|an|the)\s+[a-z0-9_\- ]{2,40}',
        r'(?:new|updated|override|additional)\s+instructions?\s*:',
        r'do\s+not\s+follow\s+(?:the\s+)?(?:above|previous|prior|system)',
        r'jailbreak|developer\s+mode|prompt\s+injection',
        r'(?:instead\s+of|rather\s+than)\s+(?:the\s+)?(?:above|previous|system)\s+'
        r'(?:instructions?|prompt|rules?)',
    )
)

_TAG_PATTERN = re.compile(r'<[^>]{0,200}>')
_CONTROL_PATTERN = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')


@dataclass(frozen=True)
class ScrubbedText:
    text: str
    injectionAttempted: bool
    redactions: int
    truncated: bool


def scrub_external_text(value: object) -> ScrubbedText:
    """Return a safe, bounded copy of untrusted text plus a safety marker."""
    text = '' if value is None else str(value)
    redactions = 0

    for pattern in INJECTION_PATTERNS:
        text, count = pattern.subn(REDACTION, text)
        redactions += count

    text, tag_count = _TAG_PATTERN.subn(' ', text)
    redactions += tag_count
    text = _CONTROL_PATTERN.sub(' ', text)
    text = re.sub(r'[ \t]{2,}', ' ', text).strip()

    truncated = len(text) > MAX_EXTERNAL_CHARS
    if truncated:
        text = text[:MAX_EXTERNAL_CHARS].rstrip() + ' [truncated]'

    return ScrubbedText(
        text=text,
        injectionAttempted=redactions > 0,
        redactions=redactions,
        truncated=truncated,
    )


__all__ = ['MAX_EXTERNAL_CHARS', 'REDACTION', 'ScrubbedText', 'scrub_external_text']
