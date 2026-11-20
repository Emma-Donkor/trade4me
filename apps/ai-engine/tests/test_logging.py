"""Structured logging and secret redaction."""

from __future__ import annotations

import io
import json
import logging

from app.logging import JsonFormatter, configure_logging, get_logger


def test_json_formatter_redacts_sensitive_fields() -> None:
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger('redaction-test')
    logger.handlers[:] = [handler]
    logger.propagate = False
    logger.setLevel(logging.INFO)

    logger.info(
        'connect DATABASE_URL=postgres://db MARKET_API_KEY=secret',
        extra={
            'authorization': 'Bearer secret',
            'cookie': 'session=secret',
            'DATABASE_URL': 'postgres://db',
            'NEWS_API_KEY': 'secret',
            'nested': {'AI_API_KEY': 'secret', 'safe': 'visible'},
        },
    )

    record = json.loads(stream.getvalue())
    assert record['level'] == 'INFO'
    assert record['logger'] == 'redaction-test'
    assert 'DATABASE_URL=postgres://db' not in record['message']
    assert 'MARKET_API_KEY=secret' not in record['message']
    assert record['authorization'] == '***REDACTED***'
    assert record['cookie'] == '***REDACTED***'
    assert record['DATABASE_URL'] == '***REDACTED***'
    assert record['NEWS_API_KEY'] == '***REDACTED***'
    assert record['nested'] == {'AI_API_KEY': '***REDACTED***', 'safe': 'visible'}


def test_configure_logging_installs_json_handler_once() -> None:
    root = logging.getLogger()

    configure_logging('DEBUG')
    configure_logging('DEBUG')

    json_handlers = [
        handler for handler in root.handlers if isinstance(handler.formatter, JsonFormatter)
    ]
    assert len(json_handlers) == 1
    assert root.level == logging.DEBUG


def test_get_logger_returns_named_logger() -> None:
    assert get_logger('ai-engine-test').name == 'ai-engine-test'
