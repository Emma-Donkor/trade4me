#!/usr/bin/env sh
set -u

# PHASE 01 environment gate. Exit 0 only when the toolchain meets minimums
# and both Docker data-tier containers are running and healthy.

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
FAILED=0

pass() { printf '  [ OK ] %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n' "$1" >&2; FAILED=1; }

# Compare dotted versions using GNU sort -V (available in Git Bash on Windows).
version_ge() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n 1)" = "$2" ]
}

printf 'TradeSense AI — environment verification\n\n'

printf 'Toolchain (minimums: Node 20, npm 10, Python 3.11):\n'
for tool in node npm docker git; do
  if command -v "$tool" >/dev/null 2>&1; then
    pass "$tool — $(eval "$tool --version" 2>&1 | head -n 1)"
  else
    fail "$tool not found on PATH"
  fi
done

if docker compose version >/dev/null 2>&1; then
  pass "docker compose — $(docker compose version --short 2>/dev/null || docker compose version | head -n 1)"
else
  fail "docker compose plugin unavailable"
fi

NODE_VER=$(node --version 2>/dev/null | sed 's/^v//')
if [ -n "$NODE_VER" ] && version_ge "$NODE_VER" "20"; then
  pass "Node $NODE_VER >= 20"
else
  fail "Node version '$NODE_VER' is below 20"
fi

NPM_VER=$(npm --version 2>/dev/null || true)
if [ -n "$NPM_VER" ] && version_ge "$NPM_VER" "10"; then
  pass "npm $NPM_VER >= 10"
else
  fail "npm version '$NPM_VER' is below 10"
fi

PY_BIN=$(command -v python 2>/dev/null || command -v python3 2>/dev/null || true)
if [ -n "$PY_BIN" ]; then
  PY_VER=$("$PY_BIN" --version 2>&1 | awk '{print $2}')
  if [ -n "$PY_VER" ] && version_ge "$PY_VER" "3.11"; then
    pass "Python $PY_VER >= 3.11 ($PY_BIN)"
  else
    fail "Python version '$PY_VER' is below 3.11"
  fi
else
  fail "python/python3 not found on PATH"
fi

printf '\nEnvironment files:\n'
for file in .env.example .env.local .env.test; do
  if [ -f "$ROOT_DIR/$file" ]; then
    pass "$file present"
  else
    fail "$file missing"
  fi
done

printf '\nApplication ports (3000 / 4000 / 8000 must be free):\n'
if command -v netstat >/dev/null 2>&1; then
  for port in 3000 4000 8000; do
    if netstat -ano 2>/dev/null | grep -Eq "[:.]$port[[:space:]].*LISTENING"; then
      fail "port $port is already in use"
    else
      pass "port $port free"
    fi
  done
else
  pass "netstat unavailable — port check skipped"
fi

printf '\nData-tier containers:\n'
for entry in "postgres:tradesense-postgres" "redis:tradesense-redis"; do
  svc=${entry%%:*}
  name=${entry#*:}
  running=$(docker inspect --format '{{.State.Running}}' "$name" 2>/dev/null || true)
  health=$(docker inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null || true)
  if [ "$running" = "true" ] && [ "$health" = "healthy" ]; then
    pass "$svc ($name) running and healthy"
  else
    fail "$svc ($name) running=${running:-missing} health=${health:-missing}"
  fi
done

printf '\n'
if [ "$FAILED" -eq 0 ]; then
  printf 'Environment verified: all checks passed.\n'
  exit 0
fi

printf 'Environment verification FAILED.\n' >&2
exit 1
