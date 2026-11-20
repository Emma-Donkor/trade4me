#!/usr/bin/env sh
set -eu

# PHASE 01: bootstrap the Python virtualenv used by apps/ai-engine.
# PHASE 02 adds requirements.txt; install it with:
#   apps/ai-engine/.venv/Scripts/python.exe -m pip install -r apps/ai-engine/requirements.txt
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
AI_DIR="$ROOT_DIR/apps/ai-engine"
VENV_DIR="$AI_DIR/.venv"

PY=${PYTHON:-python}
if ! command -v "$PY" >/dev/null 2>&1; then
  PY=python3
fi

mkdir -p "$AI_DIR"
if [ ! -d "$VENV_DIR" ]; then
  printf 'Creating Python virtualenv at %s\n' "$VENV_DIR"
  "$PY" -m venv "$VENV_DIR"
else
  printf 'Virtualenv already exists at %s\n' "$VENV_DIR"
fi

if [ -x "$VENV_DIR/Scripts/python.exe" ]; then
  VENV_PY="$VENV_DIR/Scripts/python.exe"
else
  VENV_PY="$VENV_DIR/bin/python"
fi

"$VENV_PY" -m pip --version
"$VENV_PY" -c 'import sys; print("Python venv ready:", sys.version.split()[0])'
