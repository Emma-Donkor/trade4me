from fastapi import FastAPI

from .config import APP_NAME, APP_VERSION, HEALTH_PATH

app = FastAPI(title=APP_NAME, version=APP_VERSION)


@app.get(HEALTH_PATH)
def health() -> dict[str, str]:
    """Liveness probe; dependency checks arrive in PHASE 03."""
    return {'status': 'ok'}
