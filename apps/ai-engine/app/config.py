"""Application settings mirroring the validated TypeScript environment schema.

The field names intentionally match the environment variable names one-to-one so
the Python and TypeScript services cannot drift apart silently.
"""

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _strip_cron_comment(value: object) -> object:
    """Drop trailing ``# ...`` annotations used for readability in .env files."""
    if isinstance(value, str):
        return value.split(' #', 1)[0].strip()
    return value


class Settings(BaseSettings):
    """Validated process environment for the AI engine."""

    model_config = SettingsConfigDict(
        env_file='.env.local',
        extra='ignore',
        case_sensitive=True,
    )

    # Application
    NODE_ENV: str = 'development'
    NEXT_PUBLIC_APP_URL: str = 'http://localhost:3000'
    API_URL: str = 'http://localhost:4000'
    AI_SERVICE_URL: str = 'http://localhost:8000'
    # Internal API→AI bearer token. Override in every deployed environment.
    AI_SERVICE_TOKEN: str = 'tradesense-dev-service-token'
    API_PORT: int = 4000
    AI_PORT: int = 8000
    CORS_ORIGINS: str = 'http://localhost:3000'
    TRUST_PROXY: int = 1

    # Database and cache
    DATABASE_URL: str = (
        'postgresql://tradesense:tradesense@localhost:5433/tradesense?schema=public'
    )
    DATABASE_POOL_SIZE: int = 10
    REDIS_URL: str = 'redis://localhost:6380'
    REDIS_PREFIX: str = 'tradesense:'

    # Authentication and sessions
    JWT_SECRET: str = ''
    JWT_ACCESS_TTL: str = '15m'
    JWT_REFRESH_SECRET: str = ''
    JWT_REFRESH_TTL: str = '7d'
    REFRESH_COOKIE_NAME: str = 'ts_refresh'
    REFRESH_COOKIE_SECURE: bool = True
    BCRYPT_ROUNDS: int = 12
    SESSION_IDLE_TIMEOUT_MINUTES: int = 60

    # Market data providers
    MARKET_DATA_PROVIDER: str = 'mock'
    MARKET_API_KEY: str = ''
    MARKET_BACKUP_PROVIDER: str = 'twelvedata'
    MARKET_BACKUP_API_KEY: str = ''
    MARKET_REQUESTS_PER_MINUTE: int = 5
    MARKET_DATA_STALE_THRESHOLD_SECONDS: int = 120

    # News and economic calendar
    NEWS_PROVIDER: str = 'mock'
    NEWS_API_KEY: str = ''
    NEWS_POLL_INTERVAL_MINUTES: int = 15
    ECONOMIC_CALENDAR_PROVIDER: str = 'mock'
    ECONOMIC_CALENDAR_API_KEY: str = ''

    # LLM (explanations only, never raw trade decisions)
    AI_LLM_PROVIDER: str = 'openai'
    AI_API_KEY: str = ''
    AI_LLM_MODEL: str = 'gpt-4o-mini'
    AI_LLM_MAX_TOKENS: int = 700
    AI_LLM_TIMEOUT_MS: int = 15000

    # ML / model registry
    MODEL_REGISTRY_PATH: str = './models'
    FEATURE_VERSION: str = 'v1.0'
    DEFAULT_MODEL_NAME: str = 'xgboost'
    DEFAULT_MODEL_VERSION: str = '1.0.0'
    PREDICTION_THRESHOLD: float = 0.30
    WALK_FORWARD_ENABLED: bool = True

    # Background jobs (BullMQ)
    MARKET_SYNC_CRON: str = '0 * * * *'
    MARKET_INTEGRITY_CRON: str = '0 4 * * *'
    NEWS_INGEST_CRON: str = '*/15 * * * *'
    FEATURE_JOB_CRON: str = '*/30 * * * *'
    OUTCOME_JOB_CRON: str = '0 * * * *'
    CLEANUP_CRON: str = '0 3 * * *'
    MODEL_EVAL_CRON: str = '0 5 * * *'
    DRIFT_JOB_CRON: str = '0 6 * * *'

    @field_validator(
        'MARKET_SYNC_CRON',
        'MARKET_INTEGRITY_CRON',
        'NEWS_INGEST_CRON',
        'FEATURE_JOB_CRON',
        'OUTCOME_JOB_CRON',
        'CLEANUP_CRON',
        'MODEL_EVAL_CRON',
        'DRIFT_JOB_CRON',
        mode='before',
    )
    @classmethod
    def _normalise_cron(cls, value: object) -> object:
        return _strip_cron_comment(value)

    # Rate limiting
    RATE_LIMIT_WINDOW_MS: int = 60000
    RATE_LIMIT_MAX: int = 100
    RATE_LIMIT_AUTH_MAX: int = 10

    # Risk engine defaults
    DEFAULT_RISK_PROFILE: str = 'MODERATE'
    DEFAULT_RISK_PER_TRADE_PCT: float = 1.0
    MAX_RISK_PER_TRADE_PCT: float = 2.0
    MAX_OPEN_POSITIONS: int = 5
    MAX_DAILY_LOSS_PCT: float = 3.0
    MIN_RISK_REWARD_RATIO: float = 1.5

    # Observability
    LOG_LEVEL: str = 'info'
    ENABLE_REQUEST_IDS: bool = True
    SENTRY_DSN: str = ''

    # Testing
    TEST_DATABASE_URL: str = (
        'postgresql://tradesense:tradesense@localhost:5432/tradesense_test'
    )
    E2E_BASE_URL: str = 'http://localhost:3000'


settings = Settings()

# Backwards-compatible service metadata used by the PHASE 02 skeleton.
APP_NAME = 'TradeSense AI Engine'
APP_VERSION = '0.2.0'
HEALTH_PATH = '/health'
