# Local Environment Notes (PHASE 00 / PHASE 01)

This file records verified toolchain state and machine-specific deviations from
`README.md` §23–24. The README remains the source of truth for the target
configuration; this note documents only local execution details.

## Verified toolchain (2026-11-17)

| Tool           | Required   | Found            |
| -------------- | ---------- | ---------------- |
| Node.js        | ≥ 20       | v26.4.0          |
| npm            | ≥ 10       | 11.17.0          |
| Python         | ≥ 3.11     | 3.15.0           |
| Docker         | any recent | 29.8.2           |
| Docker Compose | v2 plugin  | v5.5.1           |
| Git            | any recent | 2.56.0.windows.2 |

Version pins `.nvmrc` (20) and `.python-version` (3.11) are the project
baselines. The locally installed newer versions satisfy the minimums enforced
by `scripts/verify-env.sh`; nvm/pyenv users will be switched to the pinned
versions.

## Windows-specific setup

- Shell used for verification: **Git Bash** (`scripts/verify-env.sh`) with a
  PowerShell alternative (`scripts/verify-env.ps1`).
- Docker Desktop must be running before any `docker compose` command. If the
  engine is down, launch `C:\Program Files\Docker\Docker\Docker Desktop.exe`
  and wait for `docker info` to succeed.
- Python venv activation on Windows is `.venv\Scripts\activate`, not
  `source .venv/bin/activate`. Use `scripts/setup-ai.ps1`.
- CRLF/LF: `.editorconfig` requests LF. Git's default Windows checkout may
  convert to CRLF; this does not affect execution.

## Port mapping deviation (important)

The roadmap historically targeted host ports **5432 (PostgreSQL)** and
**6379 (Redis)**, but those ports were already occupied on this machine:

| Port | Occupant                                   | Action                                           |
| ---- | ------------------------------------------ | ------------------------------------------------ |
| 5432 | native `postgresql-x64-18` Windows service | left running (no elevation available to stop it) |
| 6379 | native `memurai.exe` (Redis-compatible)    | left running (no elevation available to stop it) |

The Docker data tier therefore publishes **5433 → 5432** and **6380 → 6379**.
`.env.example`, `.env.local` and `.env.test` use the host-side ports. Internal container ports
and all URLs inside the Docker network remain the documented ones. If the
native services are later stopped by an administrator, the compose port
mappings and env files can be switched back to 5432/6379 without other changes.

## Data tier

```bash
docker compose up -d
docker compose ps                      # both services should show healthy
docker compose exec postgres psql -U tradesense -d tradesense -c 'SELECT 1;'
docker compose exec redis redis-cli ping
scripts/verify-env.sh                  # or: powershell -File scripts/verify-env.ps1
```

`psql` is not on the host PATH here, so database queries are run with
`docker compose exec postgres psql ...`. Host reachability of the mapped ports
was confirmed separately. The PowerShell verification scripts are deliberately
ASCII-only because Windows PowerShell 5.1 reads BOM-less UTF-8 files as ANSI.

Named volumes: `tradesense_pgdata`, `tradesense_redisdata`.
The first Postgres init also creates `tradesense_test` via
`scripts/db-init/01-create-test-db.sql` for Phase 04+ integration tests.
Test Redis keys use DB index 1 and prefix `tradesense:test:` to stay isolated
from development.

## Repo hygiene checks (PHASE 00)

```bash
git check-ignore .env .env.local .env.test   # all three must be listed
npx prettier --check .
npx eslint .
```

`README.md` and `IMPLEMENTATION-ROADMAP.md` are excluded from Prettier via
`.prettierignore` because they are verified (not reformatted) artifacts.
