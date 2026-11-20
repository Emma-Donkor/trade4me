from app.deps.db import asyncpg_dsn


def test_asyncpg_dsn_strips_prisma_schema_parameter() -> None:
    url = 'postgresql://tradesense:tradesense@localhost:5433/tradesense?schema=public'
    assert asyncpg_dsn(url) == 'postgresql://tradesense:tradesense@localhost:5433/tradesense'


def test_asyncpg_dsn_preserves_other_query_parameters() -> None:
    url = 'postgresql://user:pass@host/db?sslmode=require&schema=public'
    assert asyncpg_dsn(url) == 'postgresql://user:pass@host/db?sslmode=require'
