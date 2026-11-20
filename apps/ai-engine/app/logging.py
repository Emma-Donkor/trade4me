"""Structured JSON logging with redaction of secrets.

Every log line is a single JSON object on stdout so log shippers can index
fields without parsing human-readable strings.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any

from .config import settings

REDACTED = '***REDACTED***'

# Keys are compared case-insensitively: authorization / Cookie / DATABASE_URL.
_SENSITIVE_EXACT = frozenset({'authorization', 'cookie', 'database_url'})
_SENSITIVE_PATTERN = re.compile(r'API_KEY', re.IGNORECASE)
_ASSIGNMENT_PATTERN = re.compile(
    r'(?P<key>Authorization|Cookie|DATABASE_URL|[A-Za-z0-9_]*API_KEY[A-Za-z0-9_]*)'
    r'(?P<separator>\s*[:=]\s*)'
    r'(?P<value>"[^"]*"|\'[^\']*\'|[^\s,;}]+)',
    re.IGNORECASE,
)

_RESERVED_LOG_RECORD_FIELDS = frozenset(
    {
        'args',
        'created',
        'exc_info',
        'exc_text',
        'filename',
        'funcName',
        'levelname',
        'levelno',
        'lineno',
        'module',
        'msecs',
        'message',
        'msg',
        'name',
        'pathname',
        'process',
        'processName',
        'relativeCreated',
        'stack_info',
        'thread',
        'threadName',
        'taskName',
    }
)


def is_sensitive_key(key: object) -> bool:
    """Return True for credential-bearing keys, including ``*_API_KEY*``."""
    normalised = str(key).lower()
    return normalised in _SENSITIVE_EXACT or bool(_SENSITIVE_PATTERN.search(normalised))


def redact(value: Any) -> Any:
    """Recursively replace sensitive values inside mappings and sequences."""
    if isinstance(value, Mapping):
        return {
            key: REDACTED if is_sensitive_key(key) else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [redact(item) for item in value]
    return value


def _redact_message(message: str) -> str:
    """Redact ``KEY=value`` / ``"KEY": "value"`` pairs embedded in messages."""

    def replace(match: re.Match[str]) -> str:
        return f'{match.group("key")}{match.group("separator")}{REDACTED}'

    return _ASSIGNMENT_PATTERN.sub(replace, message)


class JsonFormatter(logging.Formatter):
    """Render a log record as a flat, redacted JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            'timestamp': datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': _redact_message(record.getMessage()),
        }

        for key, value in record.__dict__.items():
            if key not in _RESERVED_LOG_RECORD_FIELDS:
                payload[key] = REDACTED if is_sensitive_key(key) else redact(value)

        if record.exc_info:
            payload['exception'] = self.formatException(record.exc_info)
        if record.stack_info:
            payload['stack'] = self.formatStack(record.stack_info)

        return json.dumps(payload, default=str)


def configure_logging(level: str | int = settings.LOG_LEVEL) -> None:
    """Install the JSON formatter on the root logger exactly once."""
    root = logging.getLogger()
    formatter = JsonFormatter()
    handler = next(
        (candidate for candidate in root.handlers if isinstance(candidate.formatter, JsonFormatter)),
        None,
    )
    if handler is None:
        handler = logging.StreamHandler()
        root.addHandler(handler)
    handler.setFormatter(formatter)

    resolved_level: str | int = level.upper() if isinstance(level, str) else level
    root.setLevel(resolved_level)


def get_logger(name: str) -> logging.Logger:
    """Return a logger that emits redacted JSON records."""
    root = logging.getLogger()
    if not any(isinstance(handler.formatter, JsonFormatter) for handler in root.handlers):
        configure_logging()
    return logging.getLogger(name)
