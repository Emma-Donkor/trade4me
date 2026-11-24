# TradeSense AI — Complete Implementation Roadmap

### The construction plan: from empty repository to production-verified system

---

> **Relationship to the documentation.** [`README.md`](README.md) is the **source of truth** for *what* the system is (vision, architecture, database, API, AI, risk, security, testing, deployment). This document is the **execution plan** for *how* to build it, phase by phase. **Do not rewrite the project documentation while executing this roadmap.** If implementation reveals a genuine design flaw, record it, propose the change, and only then amend the README.

---

## How to use this roadmap

1. Phases are executed **strictly in dependency order** (see the dependency graph).
2. A phase is **NOT complete** when code is written. It is complete only when:

   ```text
   Implementation + Testing + Integration + Validation + Documentation = COMPLETE
   ```

3. Never break previous phases: after every phase, **all prior tests plus the new tests must pass**.
4. Do not pre-create hundreds of empty files. **Create files when their phase requires them.**
5. If a phase is blocked (missing API key, unavailable provider, outage), mark it **BLOCKED** and document: blocker, why it matters, what is needed, temporary development alternative, how to resume. **Never pretend a blocked phase is complete.**
6. To execute a phase, say **"Start Phase XX"** — the requirements for that phase will be read, the repository inspected, the phase implemented, tested, fixed, verified, reported, and the next phase identified. Then wait for the next instruction.

### Universal engineering rules (apply to every phase)

```text
Inspect → Understand → Plan → Implement → Test → Review → Fix → Verify
```

- Only modify files required by the current phase (unless a dependency forces another change).
- Mock providers exist precisely so credential-dependent phases can proceed — use them, and never fabricate data.
- No secrets in code or git. `.env` is gitignored; `.env.example` stays annotated.
- No `TODO`, `placeholder`, `Coming soon`, or mock UI in anything that does not genuinely depend on an unavailable credential.
- Comments explain **why** (financial logic, math, security, non-obvious architecture) — nothing else.

---

## 1. Master Phase Map

```text
PROJECT START
      ↓
═══ STAGE A — FOUNDATION ═══
PHASE 00 — Project Initialization
PHASE 01 — Development Environment
PHASE 02 — Monorepo Foundation
PHASE 03 — Architecture Foundation
PHASE 04 — Database Foundation
PHASE 05 — Shared Types & Validation
PHASE 06 — Authentication & Authorization
PHASE 07 — Backend Core
      ↓
═══ STAGE B — DATA ═══
PHASE 08 — Market Data Infrastructure
PHASE 09 — Historical Data Pipeline
PHASE 10 — Technical Analysis Engine
PHASE 11 — News Intelligence
      ↓
═══ STAGE C — AI / QUANT ═══
PHASE 12 — Feature Engineering
PHASE 13 — Machine Learning Pipeline
PHASE 14 — Prediction Engine
PHASE 15 — Risk Management Engine
PHASE 16 — Decision Engine
PHASE 17 — AI Explanation Engine
      ↓
═══ STAGE D — FRONTEND  (can run in parallel from P18) ═══
PHASE 18 — Frontend Foundation
PHASE 19 — Dashboard
PHASE 20 — Market Analysis UI
PHASE 21 — Market Scanner
PHASE 22 — News Interface
PHASE 23 — Risk Interface
      ↓
═══ STAGE E — TRADING FEATURES  (backend parts parallelizable after P16) ═══
PHASE 24 — Backtesting
PHASE 25 — Paper Trading
PHASE 26 — Portfolio & Watchlist
PHASE 27 — Notifications
PHASE 28 — Admin Dashboard & Audit
      ↓
═══ STAGE F — INTEGRATION & HARDENING ═══
PHASE 29 — Full System Integration
PHASE 30 — Testing
PHASE 31 — Security Hardening
PHASE 32 — Performance Optimization
PHASE 33 — Observability
      ↓
═══ STAGE G — OPERATIONS ═══
PHASE 34 — Docker & Infrastructure
PHASE 35 — CI/CD
PHASE 36 — Staging Deployment
PHASE 37 — Production Deployment
      ↓
═══ STAGE H — COMPLETION ═══
PHASE 38 — Final QA (Acceptance Testing)
PHASE 39 — Final AI Validation
PHASE 40 — Documentation Verification
PHASE 41 — Final Project Audit & Completion
      ↓
PROJECT COMPLETE
```

**42 phases · 8 stages.**

---

## 2. Phase Dependency Graph

```text
P00 → P01 → P02 → P03 → P04 → P05 → P06 → P07
                                                  \
                                                   ├──────────────────────────────────────────────┐
                                                   ↓                                              ↓
                                            TRACK A (Data & AI)                           TRACK B (Frontend)
                                                   ↓                                              ↓
                                              P08 Market Data                               P18 Frontend Foundation
                                                   ↓                                              ↓
                                              P09 Historical                                  P19 Dashboard
                                                   ↓                                              ↓
                                              P10 Technical Analysis                          P20 Market Analysis UI
                                                   ↓                                              ↓
                                              P11 News Intelligence                           P21 Scanner
                                                   ↓                                              ↓
                                              P12 Feature Engineering                         P22 News Interface
                                                   ↓                                              ↓
                                              P13 ML Pipeline                                 P23 Risk Interface
                                                   ↓
                                              P14 Prediction Engine
                                                   ↓
                                              P15 Risk Engine ────────────┐
                                                   ↓                      │
                                              P16 Decision Engine         │ (backend portions
                                                   ↓                      │  of P24/P25 may start
                                              P17 AI Explanation          │  here in parallel
                                                   ↓                      │  with Track B)
                                     TRACK C (Trading Features)           │
                                                   ↓                      │
                                   P24 Backtesting · P25 Paper Trading · P26 Portfolio/Watchlist
                                   P27 Notifications · P28 Admin & Audit  │
                                                   ↓                      │
                                                   └──────────┬───────────┘
                                                              ↓
                                                    P29 Full Integration
                                                              ↓
                                                    P30 Testing
                                                              ↓
                                                    P31 Security Hardening
                                                              ↓
                                                    P32 Performance Optimization
                                                              ↓
                                                    P33 Observability
                                                              ↓
                                                    P34 Docker & Infrastructure
                                                              ↓
                                                    P35 CI/CD
                                                              ↓
                                                    P36 Staging Deployment
                                                              ↓
                                                    P37 Production Deployment
                                                              ↓
                                                    P38 Final QA
                                                              ↓
                                                    P39 Final AI Validation
                                                              ↓
                                                    P40 Documentation Verification
                                                              ↓
                                                    P41 Final Audit & Completion
```

### Parallelization rules

| Window | Safe parallel work | Constraint |
|---|---|---|
| After **P07** | Track A (P08→P17) **and** Track B (P18→P19, design system + auth pages) | Track B builds against API contracts from P05/P07; data-backed screens wait for their endpoints |
| After **P16** | Backend portions of P24/P25/P26 run parallel to Track B (P20–P23) | Both consume P09/P15/P16 outputs |
| P11 vs P12 | News intelligence and pure-technical features can be built concurrently | P12 news-feature integration waits for P11 |
| Never parallel | P04 before P05; P29 after all feature phases; P30–P41 are strictly sequential | Schema before contracts; integration before hardening |

---

## 3. Complete Project Skeleton (final target)

Annotated with the phase that **creates** each part. This is the end state — files appear only when their phase runs.

```text
tradesense-ai/
│
├── README.md                          ← exists (P00 verifies) · full documentation
├── IMPLEMENTATION-ROADMAP.md          ← this file (P00)
├── .env.example                       ← exists (P00 verifies, extended by later phases)
├── .gitignore                         ← P00
├── .editorconfig                      ← P00
├── .nvmrc / .python-version           ← P00
├── .prettierrc · eslint.config.js     ← P00/P02
├── .husky/                            ← P00 (pre-commit lint)
├── package.json                       ← P02 (npm workspaces root)
├── tsconfig.base.json                 ← P02
├── docker-compose.yml                 ← P01 (data tier) → P34 (full stack)
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md       ← P00
│   └── workflows/
│       ├── ci.yml                     ← P35
│       └── deploy.yml                 ← P35
│
├── apps/
│   ├── web/                           ← P03 shell → P18 foundation
│   │   ├── src/app/
│   │   │   ├── (auth)/login, register, …        ← P18
│   │   │   ├── (dashboard)/dashboard            ← P19
│   │   │   ├── (dashboard)/markets/[symbol]     ← P20
│   │   │   ├── (dashboard)/scanner              ← P21
│   │   │   ├── (dashboard)/news                 ← P22
│   │   │   ├── (dashboard)/risk                 ← P23
│   │   │   ├── (dashboard)/backtesting          ← P24
│   │   │   ├── (dashboard)/paper-trading        ← P25
│   │   │   ├── (dashboard)/portfolio            ← P26
│   │   │   ├── (dashboard)/watchlist            ← P26
│   │   │   ├── (dashboard)/notifications        ← P27
│   │   │   ├── (dashboard)/ai-assistant         ← P17/P19
│   │   │   └── (dashboard)/admin                ← P28
│   │   ├── src/components/                      ← P18 (design system) + per-phase feature components
│   │   │   ├── ui/           (shadcn primitives)← P18
│   │   │   ├── charts/       (Lightweight Charts wrappers, overlays, subcharts) ← P20
│   │   │   ├── dashboard/                          ← P19
│   │   │   ├── scanner/                          ← P21
│   │   │   └── ...
│   │   ├── src/hooks/ · src/stores/ (Zustand)   ← P18
│   │   ├── src/lib/api/ (TanStack Query clients)← P18
│   │   └── tailwind.config.ts · globals.css     ← P18
│   │
│   ├── api/                           ← P03 shell → P07 modules
│   │   └── src/
│   │       ├── main.ts · app.module.ts           ← P03
│   │       ├── common/ (filters, interceptors, guards, decorators, requestId) ← P03/P07
│   │       ├── config/                           ← P03
│   │       ├── modules/
│   │       │   ├── auth/ · users/                ← P06
│   │       │   ├── market/                       ← P07 shell → P08/P09 logic
│   │       │   ├── news/                         ← P07 shell → P11 logic
│   │       │   ├── technical-analysis/           ← P07 shell → P10 logic
│   │       │   ├── historical-analysis/          ← P07 shell → P09/P10 logic
│   │       │   ├── prediction/                   ← P07 shell → P14 logic
│   │       │   ├── signals/                      ← P07 shell → P16 logic
│   │       │   ├── risk/                         ← P07 shell → P15 logic
│   │       │   ├── backtesting/                  ← P07 shell → P24 logic
│   │       │   ├── paper-trading/                ← P07 shell → P25 logic
│   │       │   ├── portfolio/ · watchlist/       ← P07 shell → P26 logic
│   │       │   ├── notifications/                ← P07 shell → P27 logic
│   │       │   ├── ai/                           ← P07 shell → P17 logic
│   │       │   ├── admin/ · audit/               ← P07 shell → P28 logic
│   │       │   └── health/                       ← P03
│   │       ├── jobs/ (BullMQ processors + cron)  ← P08 → extended P09/P11/P12/P14
│   │       └── websocket/ (gateway)              ← P03 shell → P08/P21 events
│   │
│   └── ai-engine/                     ← P03 shell
│       ├── app/
│       │   ├── main.py · config.py               ← P03
│       │   ├── api/ (routers: indicators, features, predict, explain) ← P03 shell → P10/P12/P14/P17
│       │   ├── services/
│       │   │   ├── indicators.py (pandas-ta)     ← P10
│       │   │   ├── patterns.py (candlesticks)    ← P10
│       │   │   ├── regime.py                     ← P10
│       │   │   ├── features.py (versioned)       ← P12
│       │   │   ├── dataset.py                    ← P13
│       │   │   ├── train.py · evaluate.py        ← P13
│       │   │   ├── calibrate.py                  ← P13
│       │   │   ├── registry.py (ModelVersion/Run)← P13
│       │   │   ├── predict.py                    ← P14
│       │   │   ├── drift.py                      ← P14
│       │   │   ├── explanation.py (LLM)          ← P17
│       │   │   ├── assistant.py (grounded QA)    ← P17
│       │   │   └── llm/ (provider abstraction)   ← P17
│       │   └── tests/ (pytest: indicators, leakage, calibration, reproducibility) ← P10→P13
│       ├── requirements.txt                      ← P02
│       └── Dockerfile                            ← P34
│
├── packages/
│   ├── types/                         ← P05 (contracts: MarketQuote, Candle, Prediction, Signal, …)
│   ├── validation/                    ← P05 (Zod schemas)
│   ├── config/                        ← P03 (env loading, constants, feature weights, thresholds)
│   └── database/                      ← P04 (Prisma client wrapper, repositories)
│
├── prisma/
│   ├── schema.prisma                  ← P04 (all enums + 27 models)
│   ├── migrations/                    ← P04 (generated)
│   └── seed.ts                        ← P04 (pairs, demo user, risk profiles, model registry)
│
├── infrastructure/
│   ├── docker/                        ← P34 (api/ai/web Dockerfiles, compose fragments)
│   └── deployment/                    ← P34/P37 (prod overlay, reverse-proxy config)
│
├── docs/
│   ├── (README documentation is the doc set)
│   ├── openapi.json                   ← P35 (exported artifact)
│   └── research/PROJECT-REPORT.md     ← P40 (optional expanded academic report)
│
├── scripts/                           ← P02 (db:*, dev orchestration helpers)
├── tests/                             ← P29/P30 (cross-service E2E / Playwright)
│   ├── e2e/                                       ← P30
│   └── fixtures/ (recorded provider responses)     ← P08/P11
│
├── models/                            ← P13 (gitignored artifacts; registry path)
└── .env.local · .env.test             ← P01 (gitignored)
```

---

## 4. Phase-by-Phase Plan

---

## PHASE 00 — Project Initialization

### Objective
Initialize the repository with version control, tool-version pinning, conventions and the documentation baseline every later phase depends on.

### Why This Phase Exists
Without a reproducible repo, enforced conventions and pinned toolchains, every subsequent phase diverges. Conventions are cheapest to establish when the repository is empty.

### Dependencies
None — this is the entry point.

### Tasks
- [ ] Confirm project root and git repository (`git init`, branch `main`)
- [ ] Add `.gitignore` (Node, Python, `.env*` except `.env.example`, IDE, OS, docker volumes, `models/`, `*.log`)
- [ ] Pin tool versions: `.nvmrc` (Node 20), `.python-version` (3.11), `packageManager` field (npm ≥10)
- [ ] Add `.editorconfig`, Prettier config, root ESLint config, Python lint config (ruff)
- [ ] Define branching strategy: protected `main`, `feature/PXX-short-name` branches, PR-required merges, Conventional Commits
- [ ] Add PR template and commit-msg hook (husky + commitlint)
- [ ] Verify `README.md` (full documentation) and `.env.example` are present and accurate
- [ ] Add pre-commit hook: lint-staged (prettier/eslint on staged files)
- [ ] Record development conventions in the PR template (SOLID/DRY/KISS, strong typing, comment policy)

### Files/Folders
```text
.gitignore
.editorconfig
.nvmrc
.python-version
.prettierrc
eslint.config.js
ruff.toml
.husky/pre-commit · .husky/commit-msg
.github/PULL_REQUEST_TEMPLATE.md
package.json (minimal root)
README.md (verify only)
.env.example (verify only)
IMPLEMENTATION-ROADMAP.md (this file)
```

### Implementation
Repository hygiene only — no application code. Git hooks must be installable via `npm install` (prepare script).

### Database Changes
None.

### API Changes
None.

### AI/ML Changes
None.

### Frontend Changes
None.

### Security Requirements
`.gitignore` must exclude every secret-bearing file; verify with `git status` that no `.env` variant is tracked.

### Testing
- [ ] Fresh `git clone` → `npm install` succeeds
- [ ] `npx prettier --check .` and `npx eslint .` run (zero config errors)
- [ ] `git check-ignore .env` confirms ignore rules

### Completion Criteria
Repository initializes; hooks fire; linters run clean; documentation files present; no tracked secrets.

### Phase Output
A convention-enforced, reproducible empty repository.

### Next Phase
**PHASE 01 — Development Environment**

---

## PHASE 01 — Development Environment

### Objective
Provision and verify the complete local toolchain (Node, Python, PostgreSQL, Redis, Docker) so every later phase runs against working infrastructure.

### Why This Phase Exists
Phases 04+ require a live database; phases 08+ require Redis. Environment problems discovered late are expensive. The data tier must exist before the schema does.

### Dependencies
```text
Depends on: PHASE 00
```

### Tasks
- [x] Verify toolchain: `node --version` (≥20), `npm --version`, `python --version` (≥3.11), `docker --version`, `docker compose version`, `git --version`
- [x] Create `docker-compose.yml` with **data tier only**: `postgres:16` (user/db `tradesense`, volume, healthcheck) and `redis:7` (password optional locally, healthcheck, volume)
- [x] Create `.env.local` from `.env.example` (defaults, mock providers, keyless)
- [x] Create `.env.test` pointing `DATABASE_URL` at `tradesense_test`
- [x] Create Python virtualenv bootstrap script (`scripts/setup-ai.sh|ps1`)
- [x] Write environment verification script (`scripts/verify-env.sh`) checking all tools + both containers healthy
- [x] Confirm ports free: 3000 (web), 4000 (api), 8000 (ai), 5432, 6379
- [x] Document any environment-specific gotchas (Windows paths, Docker Desktop memory)

### Files/Folders
```text
docker-compose.yml          (data tier; extended in P34)
.env.local (gitignored)
.env.test  (gitignored)
scripts/setup-ai.sh|ps1
scripts/verify-env.sh
```

### Implementation
Compose file with named volumes (`pgdata`, `redisdata`), healthchecks (`pg_isready`, `redis-cli ping`), fixed container names for stable local URLs, and `.env` values matching README §23.

### Database Changes
None (containers only — no schema).

### API Changes
None.

### AI/ML Changes
Python venv + `pip` verified; no packages installed yet (requirements come in P02/P03).

### Frontend Changes
None.

### Security Requirements
`.env.local` / `.env.test` are gitignored; database credentials are local-only and never committed.

### Testing
- [x] `docker compose up -d` → both containers healthy
- [x] `psql` connection query succeeds (`SELECT 1`)
- [x] `redis-cli ping` → `PONG`
- [x] `scripts/verify-env.sh` exits 0

### Completion Criteria
All tools verified; PostgreSQL and Redis running with healthchecks; env files in place; verification script passes.

### Phase Output
A working, reproducible development environment.

### Next Phase
**PHASE 02 — Monorepo Foundation**

---

## PHASE 02 — Monorepo Foundation

### Objective
Create the npm-workspaces monorepo with three application skeletons (buildable but empty), four shared packages, and a working build/lint/test toolchain.

### Why This Phase Exists
Shared types, config and the Prisma wrapper are imported by every later module. The workspace contract must exist before feature code, or duplication and drift begin immediately.

### Dependencies
```text
Depends on: PHASE 00, PHASE 01
```

### Tasks
- [x] Root `package.json` with npm workspaces: `apps/*`, `packages/*`
- [x] Root `tsconfig.base.json` (strict: true, ES2022, path aliases `@ts/types`, `@ts/validation`, `@ts/config`, `@ts/database`)
- [x] Workspace scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `db:*`, `format`
- [x] `apps/api` — NestJS skeleton: `nest new` equivalent, boots on :4000, `GET /api/v1/health` returns placeholder
- [x] `apps/web` — Next.js App Router skeleton (TypeScript strict, Tailwind installed), boots on :3000
- [x] `apps/ai-engine` — FastAPI skeleton with `GET /health`, uvicorn dev script, `requirements.txt` (fastapi, uvicorn, pandas, numpy, scikit-learn, xgboost, pandas-ta, statsmodels, pydantic, pytest, httpx)
- [x] `packages/types` — barrel export skeleton (no domain types yet)
- [x] `packages/validation` — Zod skeleton
- [x] `packages/config` — env loader skeleton (zod-validated env object)
- [x] `packages/database` — Prisma client re-export skeleton (client generated in P04)
- [x] `concurrently`-based `npm run dev` running web + api + ai together
- [x] Cross-workspace imports verified (`@ts/types` resolves in api, web, and via tsconfig paths)
- [x] ESLint + Prettier configured per workspace; `npm run lint` and `npm run typecheck` pass across all workspaces
- [x] Jest configured at root for TS packages; one trivial passing test per workspace proves the harness

### Files/Folders
```text
package.json · tsconfig.base.json
apps/api/{package.json, tsconfig.json, nest-cli.json, src/main.ts, src/app.module.ts, src/app.controller.ts}
apps/web/{package.json, tsconfig.json, next.config.mjs, src/app/layout.tsx, src/app/page.tsx}
apps/ai-engine/{requirements.txt, app/main.py, app/config.py, tests/test_health.py}
packages/types/{package.json, tsconfig.json, src/index.ts}
packages/validation/{package.json, tsconfig.json, src/index.ts}
packages/config/{package.json, tsconfig.json, src/index.ts, src/env.ts}
packages/database/{package.json, tsconfig.json, src/index.ts}
scripts/dev.mjs
```

### Implementation
Each app builds independently (`npm run build -w apps/api` etc.). Shared packages compile to `dist/` with declaration files. Python service exposes `/health` and has its first passing pytest.

### Database Changes
None (client wrapper only; schema is P04).

### API Changes
```text
GET /api/v1/health  →  { status: "ok" } (placeholder; real readiness in P03/P33)
```

### AI/ML Changes
FastAPI health endpoint only.

### Frontend Changes
Default Next.js page renders (replaced entirely in P18).

### Security Requirements
`packages/config` must be the **only** place env vars are read; it validates via Zod and refuses to boot on missing required vars in production mode.

### Testing
- [x] `npm run typecheck` passes on all workspaces
- [x] `npm run lint` passes
- [x] `npm run build` builds all three apps
- [x] `npm test` runs one passing test per workspace
- [x] `pytest apps/ai-engine` passes
- [x] Cross-package import compiles in `apps/api`

### Completion Criteria
All apps build and boot; shared packages import cleanly; lint/typecheck/test green across the monorepo.

### Phase Output
A runnable monorepo skeleton.

### Next Phase
**PHASE 03 — Architecture Foundation**

---

## PHASE 03 — Architecture Foundation

### Objective
Install the cross-cutting architecture that every module will use: configuration, structured logging, request IDs, error envelope, guards/interceptors scaffolding, WebSocket gateway, BullMQ queue scaffolding, health/readiness endpoints, OpenAPI setup — plus the real shells of all three services.

### Why This Phase Exists
Error handling, logging and request correlation must be uniform *before* feature modules exist, otherwise each module invents its own. Retrofitting the error envelope across 18 modules later is a rewrite.

### Dependencies
```text
Depends on: PHASE 02
```

### Tasks
- [x] **Config package finalized:** zod-validated env (all vars from `.env.example`), typed constants (timeframes, score bands, default decision weights), fail-fast in production
- [x] **API common layer:** global exception filter producing README §8.1 envelope (`success/error{code,message,details,requestId}`), request-ID interceptor (`ENABLE_REQUEST_IDS`), structured JSON logger, response serializer
- [x] **API bootstrap:** Swagger/OpenAPI at `/api/v1/docs`, helmet security headers, CORS allowlist from `CORS_ORIGINS`, global `ValidationPipe` wired to Zod/class-validator DTOs
- [x] **Health module:** `GET /health` (liveness), `GET /health/ready` (DB + Redis + AI-service checks, degraded status reporting)
- [x] **Redis client module** (ioredis, namespaced `tradesense:`) + **Prisma module** (connection lifecycle; schema comes in P04 — module tolerates missing tables)
- [x] **WebSocket gateway** with Redis adapter (auth handshake accepting JWT; event envelope matches README §8.3)
- [x] **BullMQ scaffolding:** queue registry (`market-sync`, `news-ingest`, `features`, `outcomes`, `cleanup`, `health`), worker bootstrap, cron registrations from README §20.3, idempotent job base class
- [x] **Audit module skeleton** (service writing `AuditLog` — table exists in P04)
- [x] **AI-engine shell:** pydantic settings mirroring env, structured logging, `/health` with dependency checks (db/redis), routers registered but returning `501` stubs for `indicators`, `features`, `predict`, `explain`
- [x] **Config parity test:** TS env schema and Python settings must validate the same variable set

### Files/Folders
```text
packages/config/src/{env.ts, constants.ts, weights.ts, index.ts}
apps/api/src/
  main.ts · app.module.ts
  common/{filters/http-exception.filter.ts, interceptors/request-id.interceptor.ts,
          interceptors/logging.interceptor.ts, guards/jwt-auth.guard.ts,
          guards/roles.guard.ts, decorators/{current-user,roles,public}.ts}
  config/{configuration.ts, validation.ts}
  modules/{health/ (module, controller, service), redis/, prisma/, audit/, websocket/gateway.ts}
  jobs/{queues.ts, worker.ts, base.processor.ts, schedulers.ts}
apps/ai-engine/app/{config.py, logging.py, api/routers/{health,indicators,features,predict,explain}.py,
                    deps/{db.py, redis.py}}
```

### Implementation
The API boots with: every response enveloped, every request carrying `requestId`, every error mapped to a documented code, Swagger rendering, WS gateway connecting through Redis, queues registered (processors empty). The AI service boots with settings validation and stub routers.

### Database Changes
None (Prisma module connects; tables arrive in P04). *Note: audit writes are queued until P04 migrates `AuditLog`.*

### API Changes
```text
GET  /api/v1/health
GET  /api/v1/health/ready
GET  /api/v1/docs              (Swagger UI)
WS   /                          (authenticated gateway; events later)
```

### AI/ML Changes
Stub routers (501) define request/response pydantic models — the API contract for P10/P12/P14/P17.

### Frontend Changes
None (P18).

### Security Requirements
Helmet + CSP headers active; CORS allowlist enforced; JWT/Role guards implemented (activated in P06); no stack traces in responses; logger redacts `authorization`, `cookie`, `*API_KEY*`, `DATABASE_URL`.

### Testing
- [x] Unit: exception filter maps unknown error → 500 `INTERNAL_ERROR` without stack leak
- [x] Unit: request-ID interceptor propagates `x-request-id`
- [x] Integration: `/health/ready` reports each dependency correctly (up/down)
- [x] Integration: Redis connect/reconnect; queue enqueue/dequeue round-trip
- [x] Contract: Python stub models match TS types for the four AI routes
- [x] Regression: all P02 tests still pass

### Completion Criteria
All three services boot with uniform error/logging/health contracts; Swagger renders; WS gateway connects; queues idle-ready; no feature logic yet.

### Phase Output
The architectural skeleton that all subsequent backend phases plug into.

### Next Phase
**PHASE 04 — Database Foundation**

---

## PHASE 04 — Database Foundation

### Objective
Create the complete PostgreSQL schema — all enums and all 27 models from README §7 — with migrations, indexes, constraints and a seed system, plus the `packages/database` wrapper every module will use.

### Why This Phase Exists
Every later phase reads or writes these tables. Schema errors found after feature code exists are the most expensive class of rework. The database must be stable, indexed and seedable before anything depends on it.

### Dependencies
```text
Depends on: PHASE 03
```

### Tasks
- [x] `prisma init` and author **complete** `schema.prisma` per README §7.2–7.3:
  - Enums: `Role`, `Timeframe`, `Direction`, `SignalAction`, `RiskLevel`, `MarketRegime`, `Sentiment`, `NewsImpact`, `PositionStatus`, `PositionSide`, `NotificationType`, `ProviderStatus`, `ModelStatus`, `AuditAction`, `BacktestStatus`
  - Identity: `User`, `UserProfile`, `RiskProfile`
  - Market: `CurrencyPair`, `MarketCandle`, `MarketQuote`, `TechnicalIndicator`, `MarketFeature`
  - News: `NewsArticle`, `NewsAnalysis`, `EconomicEvent`
  - AI: `ModelVersion`, `ModelRun`, `Prediction`, `PredictionOutcome`, `AIAnalysis`
  - Trading: `TradeSignal`, `SignalFeature`, `Backtest`, `BacktestTrade`, `Portfolio`, `Position`, `Watchlist`, `WatchlistItem`
  - System: `Notification`, `AuditLog`, `SystemEvent`
- [x] Conventions enforced: cuid PKs, `createdAt`/`updatedAt`, `Decimal` for money/prices (`Decimal(18,6)`), explicit `onDelete` (Cascade for owned children, Restrict for reference data)
- [x] Constraints: unique `(pairId, timeframe, timestamp)` on `MarketCandle`; unique `(pairId, timeframe, timestamp, featureVersion)` on `MarketFeature`; unique `(pairId, timeframe, name, timestamp)` on `TechnicalIndicator`; unique `email`, `symbol`, `sourceUrl`, `contentHash`, `(watchlistId, pairId)`, `predictionId` on outcome
- [x] Time-series index: composite `(pairId, timeframe, timestamp DESC)` on `MarketCandle`; supporting indexes per README §7.3 (`(pairId, createdAt)`, `(portfolioId, status)`, `(userId, readAt, createdAt)`, `(pairId, generatedAt DESC)`)
- [x] First migration `prisma migrate dev`; verify `migrate reset` reproduces from scratch
- [x] `prisma/seed.ts`: 10 major pairs (with `pipSize`, `pointValue`, `spreadPipsTypical`, `providerSymbols` JSON), demo user (`demo@tradesense.ai`, role USER, verified, printed password from env), demo ADMIN, default risk profiles (Conservative/Moderate/Aggressive per README §14.3), one `ModelVersion` placeholder (status `ARCHIVED` until P13), active `Watchlist` for demo user
- [x] `packages/database`: Prisma client singleton, soft-connect helper, transaction helper, repository base, pagination helper
- [x] Candle repository with **column projection** + range query (enforces README §7.4 no-`SELECT *` rule)
- [x] Prisma Studio script `npm run db:studio`
- [x] Migration/reset/seed npm scripts: `db:migrate`, `db:reset`, `db:seed`, `db:studio`
- [x] TimescaleDB readiness note documented (hypertable migration path — no restructuring)

### Files/Folders
```text
prisma/schema.prisma
prisma/migrations/**  (generated)
prisma/seed.ts
packages/database/src/{client.ts, repositories/{candle.repo.ts, quote.repo.ts, base.repo.ts}, transaction.ts, index.ts}
package.json (db scripts added)
```

### Database Changes
**All tables, enums, relations, indexes, constraints — the complete schema.** Verify with `prisma migrate reset` on empty DB + seed + `EXPLAIN` on the candle range query using the composite index.

### API Changes
None directly; `PrismaModule` becomes globally available.

### AI/ML Changes
None (schema only — `Prediction`/`ModelVersion` tables exist but are unused until P13/P14).

### Frontend Changes
None.

### Security Requirements
`DATABASE_URL` only via validated env; seed passwords generated, never hardcoded; Prisma client is the sole DB access path (no raw SQL strings in later phases).

### Testing
- [x] Unit: repository pagination/projection helpers
- [x] Integration: migrate → seed → query each relation cluster (ERD traversal from README §6.2 works)
- [x] Integration: candle upsert deduplicates on unique constraint (duplicate insert is ignored/upserted)
- [x] Integration: cascade deletes (delete user → watchlists/items cascade; delete pair → restrict if referenced by predictions, or cascade per schema choice — assert defined behavior)
- [x] Integrity: candle range query uses composite index (`EXPLAIN` assertion)
- [x] Regression: P02–P03 tests pass; `db:reset && db:migrate && db:seed` is idempotent-clean

### Completion Criteria
Full schema migrated; seed reproducible; all constraints/indexes verified; repositories usable; `prisma validate` clean.

### Phase Output
A stable, indexed, seeded database — the foundation for every data phase.

### Next Phase
**PHASE 05 — Shared Types & Validation**

---

## PHASE 05 — Shared Types & Validation

### Objective
Define the single source of truth for data contracts (`packages/types`) and input validation (`packages/validation`) so frontend, backend and AI-service boundaries are consistent and compile-time safe.

### Why This Phase Exists
API contracts must be stable *before* auth (P06) and market data (P08) implement them, and the frontend (P18) must import the same shapes. This prevents the classic drift between what the API returns and what the UI expects.

### Dependencies
```text
Depends on: PHASE 04
```

### Tasks
- [x] **`packages/types`** — domain types mirroring DB models + API DTOs:
  `MarketQuote`, `Candle`, `CurrencyPair`, `Timeframe`, `TechnicalIndicatorSnapshot`, `CandlePattern`, `MarketRegime`, `NewsArticle`, `NewsAnalysis`, `EconomicEvent`, `FeatureVector` (with `featureVersion`), `Prediction` + structured model output (symbol/timeframe/direction/probability/confidence/riskLevel/modelVersion), `TradeSignal` (scores, reasons, noTradeReasons), `RiskAssessment` (positionSize, maxLoss, riskReward, verdicts), `DecisionWeights`, `SignalScoreBand`, `PortfolioSummary`, `Position`, `BacktestConfig`/`BacktestResult`, `Watchlist(Item)`, `Notification`, `AIAnalysis` (supporting/contradicting evidence, freshness), `Paginated<T>`, API envelope types (`ApiResponse<T>`, `ApiError`)
- [x] **`packages/validation`** — Zod schemas for every request body/query/params: auth payloads, pagination (`limit`/`cursor`), candle range query, backtest config, paper order (entry/sl/tp/size with refinement: sl on correct side of entry, rr ≥ 0), risk calculate/evaluate, scanner query (`sortBy ∈ score|probability|risk|volatility`), AI assistant message, watchlist reorder
- [x] Shared error-code union (`MARKET_DATA_STALE`, `MARKET_DATA_UNAVAILABLE`, `NO_TRADE_RULE_VIOLATION`, `VALIDATION_ERROR`, `RATE_LIMITED`, `AI_SERVICE_UNAVAILABLE`, `INSUFFICIENT_DATA`, …) matching README §8.4
- [x] WebSocket event payload types matching README §8.3
- [x] Zod→OpenAPI helper so Swagger schemas derive from the same source
- [x] Contract test: every type has a corresponding Zod schema where it crosses a boundary (compile-time + runtime parity)
- [x] AI-engine parity: pydantic models for the same DTOs (P03 stubs updated to import from one `app/schemas/` module), cross-checked by fixture-based parity test

### Files/Folders
```text
packages/types/src/{market.ts, news.ts, ai.ts, prediction.ts, signal.ts, risk.ts,
                    trading.ts, portfolio.ts, notification.ts, api.ts, ws.ts, index.ts}
packages/validation/src/{auth.schema.ts, market.schema.ts, backtest.schema.ts,
                         paper.schema.ts, risk.schema.ts, ai.schema.ts, common.schema.ts, index.ts}
apps/ai-engine/app/schemas/*.py
tests/contracts/type-parity.test.ts · apps/ai-engine/tests/test_schema_parity.py
```

### Implementation
Types are pure declarations (no runtime deps). Validation exports zod objects + inferred TS types (types re-export inference to avoid duplication). Both workspaces build with strict TS.

### Database Changes
None (types mirror the P04 schema; a drift test asserts field-name parity for core models).

### API Changes
None (contracts defined, not served).

### AI/ML Changes
Pydantic schema parity for `IndicatorRequest/Response`, `FeatureRequest/Response`, `PredictRequest/Response`, `ExplainRequest/Response`.

### Frontend Changes
None (consumed in P18).

### Security Requirements
Validation schemas reject unknown keys (`strict`) on auth and trading inputs; monetary inputs accept only numbers with max decimal precision; no `any` types in public contracts.

### Testing
- [x] Unit: every schema accepts valid fixture / rejects invalid fixture (table-driven)
- [x] Unit: paper-order refinement rejects SL on wrong side, negative size, zero R/R
- [x] Contract: TS↔Python payload parity for the four AI routes
- [x] Regression: P02–P04 tests pass

### Completion Criteria
All boundary contracts exist, validate, and are importable by api, web and (as pydantic) ai-engine; zero duplicated ad-hoc DTOs remain.

### Phase Output
Versioned, enforced API contracts — the interface backbone of the system.

### Next Phase
**PHASE 06 — Authentication & Authorization**

---

## PHASE 06 — Authentication & Authorization

### Objective
Implement the complete `auth` and `users` modules: registration, login, logout, refresh rotation, email verification, password reset, session management, RBAC (`USER`/`ANALYST`/`ADMIN`), MFA-ready scaffolding — plus the frontend auth pages that consume them.

### Why This Phase Exists
Every protected route, every user-owned record and the entire admin surface depend on a correct identity layer. It is the first vertical slice: schema (P04) → contracts (P05) → API → real UI — proving the stack works end-to-end before 15 more modules follow the same pattern.

### Dependencies
```text
Depends on: PHASE 04, PHASE 05
```

### Tasks
- [x] **Registration:** email+password → bcrypt hash (cost `BCRYPT_ROUNDS=12`), create `User` + `UserProfile` + default `RiskProfile` (MODERATE defaults), send verification token
- [x] **Email verification:** single-use expiring token; unverified users blocked from data routes (configurable; dev mode logs the link)
- [x] **Login:** bcrypt compare, rate-limited (`RATE_LIMIT_AUTH_MAX`), returns 15-min access JWT + 7-day rotating refresh token in httpOnly/Secure/SameSite cookie
- [x] **Refresh:** rotation with `jti` tracking; reuse detection revokes family; **logout** blacklists `jti` in Redis (`tradesense:session:{jti}`)
- [x] **Password reset:** forgot → single-use token (TTL) → reset; invalidates sessions
- [x] **Session management:** idle timeout (`SESSION_IDLE_TIMEOUT_MINUTES`), list/revoke own sessions
- [x] **RBAC:** `JwtAuthGuard` (global default) + `@Public()` decorator + `RolesGuard` + `@Roles()`; role matrix per README §19.1 (ADMIN → admin routes; ANALYST → model/prediction routes; USER → own data)
- [x] **MFA-ready:** `mfaEnabled` field + `/auth/mfa/setup` scaffold returning `501 NOT_IMPLEMENTED` with documented extension point (do not fake MFA)
- [x] **Users module:** `GET/PATCH /users/me`, `GET/PATCH /users/me/risk-profile`
- [x] **Audit:** `LOGIN`, `LOGOUT`, `REGISTER`, `SETTINGS_CHANGE` written to `AuditLog` (with requestId, IP, no secrets)
- [x] **Frontend auth pages:** `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` using React Hook Form + Zod (shared schemas), error mapping to envelope codes, httpOnly-cookie flow handled by API client
- [x] Auth middleware/guards for WebSocket handshake (P03 gateway validates JWT)

### Files/Folders
```text
apps/api/src/modules/auth/{auth.module.ts, auth.controller.ts, auth.service.ts, token.service.ts,
  strategies/jwt.strategy.ts, guards/{jwt-auth.guard.ts, roles.guard.ts},
  dto/*.ts, email/{email.service.ts, templates.ts}}
apps/api/src/modules/users/{users.module.ts, controller, service, dto}
apps/api/src/modules/audit/{audit.module.ts, audit.service.ts}   (fleshed out)
apps/web/src/app/(auth)/{login,register,forgot-password,reset-password,verify-email}/page.tsx
apps/web/src/lib/api/{client.ts, auth.ts}
```

### Implementation
First real vertical slice. The NestJS pattern established here (module/controller/service/dto/guard + zod validation + audit) becomes the template for all 16 remaining modules.

### Database Changes
Uses P04 tables (`User`, `UserProfile`, `RiskProfile`, `AuditLog`). No schema change unless a documented gap is found (then a **new** migration, never an edited one).

### API Changes
```text
POST /api/v1/auth/register | login | refresh | logout | verify-email
POST /api/v1/auth/forgot-password | reset-password
POST /api/v1/auth/mfa/setup          (501, documented)
GET  /api/v1/users/me                PATCH /api/v1/users/me
GET  /api/v1/users/me/risk-profile   PATCH /api/v1/users/me/risk-profile
```

### AI/ML Changes
None.

### Frontend Changes
Auth pages, API client (TanStack Query mutations), auth Zustand store (access token in memory; refresh via cookie), protected-route wrapper, `useSession` hook.

### Security Requirements
bcrypt never logs plaintext; timing-safe comparison via bcrypt; refresh rotation + reuse detection; cookies httpOnly+Secure+SameSite; auth routes rate-limited 10/min; reset/verification tokens single-use & expiring; RBAC deny-by-default; audit without sensitive payloads.

### Testing
- [x] Unit: token service (expiry, rotation, reuse detection, blacklist)
- [x] Unit: password policy + hashing round-trip
- [x] Integration: valid login; wrong password 401; unverified blocked; expired access 401; revoked refresh 401
- [x] Integration: role matrix — USER denied `/admin/*`, ADMIN allowed, ANALYST allowed on model routes only
- [x] E2E (first Playwright flow): register → verify (dev link) → login → dashboard redirect → logout
- [x] Security: auth rate-limit triggers 429; no stack traces; no secrets in logs
- [x] Regression: P02–P05 tests pass

### Completion Criteria
Full auth lifecycle works in API and UI; RBAC enforced globally; audit records written; E2E login flow green.

### Phase Output
Secured application shell with a repeatable module pattern.

### Next Phase
**PHASE 07 — Backend Core**

---

## PHASE 07 — Backend Core

### Objective
Create all remaining NestJS modules as **fully wired skeletons** (controllers, services, DTOs, guards, routes registered against P05 contracts) with `501`/empty-data behavior where logic arrives in later phases — plus rate limiting, pagination and pagination-tested base services.

### Why This Phase Exists
The API surface (README §8) must exist as a stable, documented, tested contract before feature phases fill it in. This lets the frontend (Track B) develop against real routes in parallel with Track A's logic, and it exposes contract gaps while they are cheap to fix.

### Dependencies
```text
Depends on: PHASE 06
```

### Tasks
- [x] Module shells registered in `AppModule` for: `market`, `news`, `technical-analysis`, `historical-analysis`, `prediction`, `signals`, `risk`, `backtesting`, `paper-trading`, `portfolio`, `watchlist`, `notifications`, `ai`, `admin`, `health` (extend P03)
- [x] Each module: controller with **every README §8.2 route** (correct method/path/auth decorator), DTO validated by shared Zod schemas, service with interface + stub implementation, module providers wired via DI
- [x] **Market module** wired to P04 repositories: `GET /market/pairs` returns seeded pairs (real data!), `GET /market/quote`, `GET /market/candles`, `GET /market/overview` return `INSUFFICIENT_DATA` until P08/P09 (contract-correct errors, not fake data)
- [x] Global **rate limiting** (Redis token buckets): global 100/min per IP, auth 10/min, `/ai/*` 20/min; `429` with `Retry-After`
- [x] **Pagination helper** (cursor-based) applied to list endpoints
- [x] **Notifications/watchlist/portfolio stubs** return empty collections (honest empty states)
- [x] **Signals/scanner stubs** return `INSUFFICIENT_DATA` (never fabricated rows)
- [x] OpenAPI completeness: every route documented with request/response/error examples; `npm run openapi:export` writes `docs/openapi.json`
- [x] WebSocket event emitters registered (no producers yet): `quote:update`, `signal:new`, `signal:changed`, `analysis:updated`, `notification:new`, `position:update`, `regime:changed`
- [x] Integration-test base: supertest harness with test DB + Redis fixtures

### Files/Folders
```text
apps/api/src/modules/
  market/ news/ technical-analysis/ historical-analysis/ prediction/ signals/ risk/
  backtesting/ paper-trading/ portfolio/ watchlist/ notifications/ ai/ admin/
  (each: *.module.ts, *.controller.ts, *.service.ts, dto/)
apps/api/src/common/{middleware/rate-limit.middleware.ts, helpers/pagination.ts,
  openapi/{route-catalog.ts, openapi.ts, openapi.module.ts}, pipes/zod-validation.pipe.ts}
apps/api/src/openapi-export.ts
apps/api/src/modules/websocket/events.service.ts
docs/openapi.json (generated)
apps/api/test/{helpers/*.ts, phase7-contract.test.ts, phase7-integration.test.ts}
```

### Implementation
Route-by-route alignment with README §8.2 — treat the README as the contract test source. Stubs must fail honestly (`INSUFFICIENT_DATA`, empty arrays), never with mock rows.

### Database Changes
None (reads P04 tables; `market/pairs` proves real reads).

### API Changes
**All remaining endpoints from README §8.2 registered** (stub bodies), documented, rate-limited, guarded.

### AI/ML Changes
`/ai/*` and analysis routes proxy to AI-service stubs (P03 501s) → surfaced as `AI_SERVICE_UNAVAILABLE` until P10/P17.

### Frontend Changes
None.

### Security Requirements
Deny-by-default auth on all non-public routes; rate limits live; input validation on every route; admin routes role-gated; OpenAPI exposes no internal-only fields.

### Testing
- [x] Contract tests: snapshot every route against README §8.2 (method, path, auth level)
- [x] Integration: rate limiter window behavior on Redis
- [x] Integration: `market/pairs` returns seeded 10 pairs with pip/point metadata
- [x] Integration: stub endpoints return documented error codes (not 500s)
- [x] Regression: P02–P06 tests pass

### Completion Criteria
Complete, documented, tested API surface exists; honest stubs everywhere; rate limiting + pagination proven; frontend can now integrate contract-first.

### Phase Output
The full API skeleton — Track A fills logic (P08–P17); Track B builds UI (P18+).

### Next Phase
**PHASE 08 — Market Data Infrastructure** (Track A) · **PHASE 18 — Frontend Foundation** may begin in parallel

---

## PHASE 08 — Market Data Infrastructure

### Objective
Implement the provider abstraction, all provider adapters (mock, AlphaVantage, TwelveData), live quote ingestion with validation/failover/caching, and the `market` module's live endpoints.

### Why This Phase Exists
Every analysis in the system starts with trustworthy data. The pipeline's validation and failover behavior (README §9) is a hard requirement — stale or fabricated data must be impossible to pass off as live.

### Dependencies
```text
Depends on: PHASE 07 (and P04, P05, P06 already completed)
```

### Tasks
- [x] `MarketDataProvider` interface (per README §9.1) + `ProviderRegistry` with primary/backup selection and health state (`ProviderStatus`)
- [x] **MockProvider**: deterministic, realistic synthetic quotes/candles (seeded random walk, correct decimals incl. JPY pairs) — enables keyless development and CI
- [x] **AlphaVantageProvider** and **TwelveDataProvider**: symbol mapping via `CurrencyPair.providerSymbols`, response parsing, error taxonomy (quota/timeout/malformed)
- [x] **Rate-limit handler**: Redis token bucket per provider (`MARKET_REQUESTS_PER_MINUTE`), exponential backoff, jitter
- [x] **Response validation** (pydantic/Zod): schema, status, numeric sanity (OHLC consistency: `low ≤ open,close ≤ high`), decimal precision
- [x] **Normalization** → `MarketQuote` upsert (`tradesense:quote:{symbol}`, TTL 30–120s per `MARKET_DATA_STALE_THRESHOLD_SECONDS`)
- [x] **Timestamp validation**: reject future/out-of-order stamps; log `SystemEvent`
- [x] **Failover**: Provider A failure → Provider B → all-fail → `MARKET_DATA_UNAVAILABLE` (no fabricated analysis); provider health written for admin (P28)
- [x] **Quote sync job** (BullMQ `market-sync`, cron `MARKET_SYNC_CRON`) — idempotent, per-pair fan-out with rate-limit awareness
- [x] Implement real route bodies: `GET /market/quote`, `GET /market/overview` (with staleness flags), WebSocket `quote:update` emissions
- [x] Redis caching layer for quotes with documented TTLs (README §7.5)
- [x] Admin health provider status readable (`admin/providers` data source prepared)

### Files/Folders
```text
apps/api/src/modules/market/
  providers/{provider.interface.ts, provider.registry.ts, mock.provider.ts,
             alphavantage.provider.ts, twelvedata.provider.ts, provider.health.ts}
  market.service.ts · quote.service.ts · market.controller.ts
apps/api/src/jobs/processors/market-sync.processor.ts
tests/fixtures/providers/{alphavantage,twelvedata,mock}/*.json
```

### Implementation
Ingestion pipeline per README §9.2: Fetcher → Auth → Rate limit → Validation → Normalization → Timestamp checks → DB/Cache. With `MARKET_DATA_PROVIDER=mock` the system runs fully keyless; switching to a real provider is env-only.

### Database Changes
Writes `MarketQuote` (upsert), `SystemEvent` (provider failures). No schema change.

### API Changes
```text
GET  /api/v1/market/quote?symbols=…      (live, staleness-flagged; `freshOnly=true` blocks with MARKET_DATA_STALE)
GET  /api/v1/market/overview             (real)
WS   quote:update                        (producer active)
PATCH /api/v1/admin/providers             (route exists; P28 uses it)
```

### AI/ML Changes
None.

### Frontend Changes
None (Track B consumes when ready).

### Security Requirements
Provider API keys read only server-side (env); never logged, never in WS payloads; response payloads schema-validated before DB write (rejects malformed/hostile data).

### Testing
- [x] Unit: OHLC validation rejects `high < low`, NaN, negative prices
- [x] Unit: rate limiter allows N/min then blocks; backoff schedules correctly
- [x] Unit: timestamp validator rejects future/out-of-order
- [x] Integration: mock provider → quote persisted → cache TTL honored → API returns with `dataFreshnessSeconds`
- [x] Integration: fixture-based adapter tests for AlphaVantage/TwelveData (recorded responses, incl. error/quota payloads)
- [x] Failure test: primary throws → failover to backup → both down → `MARKET_DATA_UNAVAILABLE` + `SystemEvent` recorded
- [x] Staleness test: frozen timestamp > threshold → API flags stale / blocks (`freshOnly=true` → `MARKET_DATA_STALE`)
- [x] Integration: `CurrencyPair.providerSymbols` reaches the adapter context end-to-end
- [x] Integration: future/out-of-order stamps write `timestamp_rejected:*` SystemEvents with the real provider name
- [x] Unit: real Redis Lua token bucket executes; default capacity covers a full 10-pair keyless sync
- [x] Regression: P02–P07 tests pass

### Completion Criteria
Live quotes flow provider → validation → DB/Redis → API → WS; failover and staleness proven by tests; mock mode fully keyless.

### Phase Output
Trustworthy real-time market data — the input to everything downstream.

### Next Phase
**PHASE 09 — Historical Data Pipeline**

---

## PHASE 09 — Historical Data Pipeline

### Objective
Build candle ingestion: initial backfill, incremental sync, gap detection and repair, freshness monitoring — and make `GET /market/candles` + historical queries fast and correct.

### Why This Phase Exists
Technical analysis (P10), features (P12), ML (P13) and backtesting (P24) all consume historical candles. Missing or wrong history silently corrupts every downstream result.

### Dependencies
```text
Depends on: PHASE 08
```

### Tasks
- [x] **Backfill service**: per pair/timeframe range import from provider (1m…1M per availability), chunked requests, resumable (checkpoint in Redis/DB)
- [x] **Incremental sync job**: fetch candles newer than last stored timestamp; upsert on `(pairId, timeframe, timestamp)`
- [x] **Gap detection**: daily integrity job scans ranges for missing candles → writes `SystemEvent` + enqueues `backfill` tasks
- [x] **Never-invent-data rule**: gaps are reported and re-requested from provider only — never interpolated, never forward-filled into storage
- [x] Implement `GET /market/candles` real body: column projection, composite-index range query, `limit`/`start`/`end` validation, cursor pagination for deep history
- [x] Candle series Redis cache (per README §7.5 TTLs: 60s intraday / 1h daily)
- [x] **Historical analysis groundwork**: `historical-analysis` module — previous days/weeks/months/years aggregations, historical volatility stats, similar-condition search endpoint skeleton (feature-space NN completed in P12)
- [x] Freshness tracking: last-sync timestamps per pair/timeframe → feed `dataFreshness` in assessments and `/admin/health` (P33)
- [x] Seed script extension: import ~2 years of D1/H1 history for all 10 pairs in mock mode (deterministic) so analysis/ML/backtest phases have data

### Files/Folders
```text
apps/api/src/modules/market/{backfill.service.ts, sync.service.ts, candles.service.ts}
apps/api/src/modules/historical-analysis/{historical-analysis.module.ts, controller, service, aggregations.ts}
apps/api/src/jobs/processors/{backfill.processor.ts, integrity.processor.ts}
scripts/seed-history.ts
```

### Implementation
Backfill → incremental → integrity loop. Every candle query path verified against the composite index.

### Database Changes
None schema-wise; **data**: populated `MarketCandle` history (seeded via mock provider).

### API Changes
```text
GET /api/v1/market/candles               (real, fast, paginated)
GET /api/v1/analysis/:symbol/historical   (aggregations real; similarity NN in P12)
```

### AI/ML Changes
None directly; supplies the dataset substrate.

### Frontend Changes
None.

### Security Requirements
Range queries bounded (max span/limit) to prevent DoS scans; provider keys remain server-side.

### Testing
- [x] Unit: gap detector identifies artificial holes in fixture series
- [x] Unit: upsert dedupes replayed ranges (idempotency)
- [x] Integration: backfill 6 months D1 for 2 pairs → counts match fixture → no gaps reported
- [x] Integration: candle endpoint returns correct OHLC ordering, respects start/end/limit, projection excludes unused columns
- [x] Performance: range query >10k rows uses composite index (EXPLAIN assertion) and returns < 100ms locally
- [x] Integrity: corrupted provider fixture → validation rejects, gap logged, no partial rows
- [x] Regression: P02–P08 tests pass

### Completion Criteria
Full history available for all seeded pairs; incremental sync + gap repair proven; candle API fast and correct; no invented data anywhere.

### Phase Output
A complete, validated, queryable historical dataset.

### Next Phase
**PHASE 10 — Technical Analysis Engine**

---

## PHASE 10 — Technical Analysis Engine

### Objective
Implement the full indicator engine, candlestick pattern engine and market regime classifier in the Python AI service — verified against reference values — and serve them through the API.

### Why This Phase Exists
Indicators are pure math: they must be computed once, centrally, and **proven correct** before features (P12) and the decision engine (P16) consume them. A wrong RSI poisons every downstream score.

### Dependencies
```text
Depends on: PHASE 09
```

### Tasks
- [ ] `app/services/indicators.py` (pandas-ta): Trend — SMA(20/50/100/200), EMA(20/50/200), MACD(12/26/9), ADX(14); Momentum — RSI(14), Stochastic(14/3/3), CCI(20), ROC(12); Volatility — ATR(14), Bollinger(20,2), Historical Volatility (annualized); Levels — support/resistance (swing clustering), swing high/low, pivots (classic + Fibonacci); Volume-aware — OBV, VWAP **flagged indicative** (spot-forex caveat surfaced in API metadata)
- [ ] `app/services/patterns.py`: Doji, Hammer, Inverted Hammer, Shooting Star, Bullish/Bearish Engulfing, Morning Star, Evening Star, Harami — with body/range ratios; each detection returns **context fields** (trend, regime, S/R distance, volatility, momentum) — never a standalone "prediction"
- [ ] `app/services/regime.py`: classify `STRONG_UPTREND|WEAK_UPTREND|RANGE|WEAK_DOWNTREND|STRONG_DOWNTREND|HIGH_VOLATILITY|LOW_VOLATILITY|UNCERTAIN` from ADX, EMA slope/stacking, price vs EMA200, ATR percentile; `UNCERTAIN` is a valid output
- [ ] Replace P03 stub: `POST /indicators` computes for symbol/timeframe/candle window; results persisted to `TechnicalIndicator` + cached (`tradesense:ta:…`, 60s) by the API layer
- [ ] `technical-analysis` module real body: `GET /analysis/:symbol/technical` → indicator snapshot + **technical score 0–100** (weighted sub-scores; weights in `packages/config`)
- [ ] Pattern results attached to the technical assessment with contextual scores
- [ ] Regime endpoint: `GET /analysis/:symbol/regime` real; regime persisted/emitted on change (`regime:changed` WS)
- [ ] `GET /analysis/:symbol` assembles technical + regime + historical (+ news when P11 lands)

### Files/Folders
```text
apps/ai-engine/app/services/{indicators.py, patterns.py, regime.py, scoring.py}
apps/ai-engine/app/api/routers/indicators.py (real impl)
apps/ai-engine/tests/{test_indicators.py, test_patterns.py, test_regime.py, fixtures/}
apps/api/src/modules/technical-analysis/{service, controller, score.service.ts}
apps/api/src/modules/analysis is realized via technical-analysis + historical-analysis routes
```

### Implementation
Computation in Python (single math authority); persistence/caching/orchestration in NestJS; scores computed deterministically from indicators + patterns + levels.

### Database Changes
Writes `TechnicalIndicator` (unique per pair/timeframe/name/timestamp) and regime into `MarketFeature` staging or dedicated cache; no schema change.

### API Changes
```text
GET /api/v1/analysis/:symbol/technical    (real)
GET /api/v1/analysis/:symbol/regime       (real)
GET /api/v1/analysis/:symbol              (partially real → complete in P17)
POST (ai) /indicators                     (internal)
```

### AI/ML Changes
Indicator/pattern/regime engines + technical scoring (deterministic; no ML).

### Frontend Changes
None.

### Security Requirements
Internal AI routes callable only with service token (network-level in P34; header check now); input candle windows bounded.

### Testing
- [ ] **Reference-value tests**: RSI/MACD/ATR/ADX/EMA against manually computed or pandas-ta canonical outputs on fixture series (the non-negotiable correctness gate)
- [ ] Unit: each pattern detected on crafted candles (e.g., classic hammer geometry) and *not* detected on near-miss geometry
- [ ] Unit: regime classifier on synthetic uptrend/downtrend/range/volatile series + `UNCERTAIN` on noise
- [ ] Unit: technical score bounds [0,100]; weight changes alter score as configured
- [ ] Integration: API → AI service → persisted indicators → cached second call is cache-hit
- [ ] Regression: P02–P09 tests pass

### Completion Criteria
Every indicator/pattern/regime output proven against reference values; technical scores served live; cache path verified.

### Phase Output
Correct, tested quantitative analysis — the technical evidence layer.

### Next Phase
**PHASE 11 — News Intelligence**

---

## PHASE 11 — News Intelligence

### Objective
Implement news ingestion, deduplication, currency/event extraction, sentiment and impact classification, economic events, and pair-level sentiment aggregation — with all external text treated as untrusted.

### Why This Phase Exists
News contributes 10% of the decision weight and drives the high-impact-event risk rule. It must produce **structured, deduplicated, classified** data — and must be injection-safe before any LLM touches article text (P17).

### Dependencies
```text
Depends on: PHASE 08 (patterns of provider plumbing), PHASE 07
```

### Tasks
- [ ] `NewsProvider` interface + adapters: **MockProvider** (curated fixture articles covering rates/inflation/GDP/employment/central-bank/geopolitics, deterministic) and production adapter (e.g. NewsAPI/Finnhub) behind `NEWS_API_KEY`
- [ ] Ingestion job (`news-ingest`, `NEWS_POLL_INTERVAL_MINUTES`): fetch → normalize → dedupe by `sourceUrl` + `contentHash` → store `NewsArticle`
- [ ] **Analysis pipeline** (README §11.1): clean text → entity/currency extraction → event classification → sentiment (`BULLISH|BEARISH|NEUTRAL`) → impact (`LOW|MEDIUM|HIGH|EXTREME`) → confidence → `NewsAnalysis` (1:1 article)
  - Initial classifier: rule/lexicon-based (financial sentiment lexicon + event keyword taxonomy) — deterministic, testable, no key required
  - LLM-assisted classification path implemented as **optional enhancer** in P17 (same structured output)
- [ ] **Economic events**: calendar ingestion (mock calendar + production adapter), `EconomicEvent` rows with `scheduledAt`, class, impact; upcoming-event proximity computed for risk rules (P15) and features (P12)
- [ ] **Aggregation**: `GET /news/sentiment/:symbol` → impact×recency-weighted pair sentiment (0–100 + label) cached 5 min
- [ ] Real route bodies: `GET /news` (filters: currency, sentiment, impact; paginated), `GET /news/:id`, `GET /news/events`
- [ ] **Untrusted-content hardening**: strip markup, truncate, neutralize injection patterns before storage/any LLM use; article text never becomes instructions
- [ ] WS/news cache invalidation on new high-impact items; `NEWS_ALERT` notification fan-out prepared for P27

### Files/Folders
```text
apps/api/src/modules/news/{news.module.ts, controller, service, aggregator.service.ts,
  providers/{news-provider.interface.ts, mock.provider.ts, production.provider.ts},
  analysis/{extractor.ts, classifier.ts, lexicon.ts, events.ts}}
apps/api/src/jobs/processors/news-ingest.processor.ts
apps/api/src/modules/news/... economic-events service
tests/fixtures/news/*.json
```

### Implementation
Deterministic classification first (testable without keys), LLM enhancement layered later without changing the stored schema.

### Database Changes
Writes `NewsArticle`, `NewsAnalysis`, `EconomicEvent`; `SystemEvent` on ingest failures. No schema change.

### API Changes
```text
GET /api/v1/news | /news/:id | /news/events | /news/sentiment/:symbol   (real)
```

### AI/ML Changes
Rule-based sentiment/impact classifier (NLP-lite); LLM path deferred to P17.

### Frontend Changes
None.

### Security Requirements
Dedupe prevents flooding; source allowlisting; injection patterns scrubbed; raw article content never rendered as HTML; rate-limited provider calls; `NEWS_API_KEY` server-side only.

### Testing
- [ ] Unit: each event class detected (rates/inflation/GDP/employment/central bank/geopolitics) on fixtures
- [ ] Unit: sentiment/impact classifier on positive/negative/neutral/urgent fixtures
- [ ] Unit: dedupe — same URL/content twice → one row
- [ ] Unit: injection fixture (`"Ignore previous instructions…"`) is stored as inert text and flagged
- [ ] Integration: ingest → classify → aggregate → `news/sentiment/EUR/USD` matches hand-computed weight
- [ ] Integration: economic-event proximity computed correctly for a scheduled fixture event
- [ ] Regression: P02–P10 tests pass

### Completion Criteria
News flows provider → dedupe → structured classification → aggregation → API; safety scrubbing proven; no LLM key required for the core path.

### Phase Output
Structured news intelligence + economic calendar feeding features, risk and decisions.

### Next Phase
**PHASE 12 — Feature Engineering**

---

## PHASE 12 — Feature Engineering

### Objective
Build the versioned ML feature pipeline that fuses technical, historical, news, regime, volatility, correlation and time features into leakage-free `FeatureVector`s.

### Why This Phase Exists
Feature quality determines model ceiling, and leakage determines whether evaluation means anything. This phase creates the **contract between data and ML** — with feature versions so every model run is reproducible.

### Dependencies
```text
Depends on: PHASE 10, PHASE 11
```

### Tasks
- [ ] `app/services/features.py`: assemble feature vector per README §13.2:
  - Technical: RSI, MACD(+hist), EMA20/50/200 distances, ADX, Bollinger width, ATR-normalized
  - Momentum/volatility: returns (1/4/12/24 bars), realized + Parkinson volatility, ATR percentile
  - Levels: distance from support/resistance (normalized by ATR)
  - Regime: one-hot encoded
  - News: pair sentiment score, sentiment impact, minutes-to-next HIGH/EXTREME event
  - Cross: currency strength index, correlation vs majors, time-of-day (UTC session), day-of-week
- [ ] **`featureVersion` discipline**: version constant in config (`FEATURE_VERSION=v1.0`), every vector persisted to `MarketFeature` with version; adding/removing a feature requires a version bump (enforced by a feature-manifest file + checksum)
- [ ] **Leakage guarantee**: every builder takes an `as_of` timestamp; only rows with `timestamp ≤ as_of` are read; news features use `publishedAt ≤ as_of`; event features use `scheduledAt > as_of` (future-known calendar events only)
- [ ] Feature generation job (`features`, cron `FEATURE_JOB_CRON`): recompute rolling vectors for all pairs/timeframes; idempotent upsert on `(pairId, timeframe, timestamp, featureVersion)`
- [ ] API surface: internal `POST /features` (AI service) + `MarketFeature` reads for prediction/scoring; historical-analysis similarity search now completed (NN over feature space)
- [ ] `Missing required features → INSUFFICIENT_DATA` (feeds NO-TRADE rule)
- [ ] Feature manifest documented (name, type, source, window) → committed `feature_manifest_v1.json`

### Files/Folders
```text
apps/ai-engine/app/services/features.py
apps/ai-engine/app/services/feature_manifest.py  (+ feature_manifest_v1.json)
apps/ai-engine/app/api/routers/features.py (real)
apps/ai-engine/tests/{test_features.py, test_leakage.py}
apps/api/src/jobs/processors/features.processor.ts
apps/api/src/modules/market/feature.service.ts
```

### Implementation
Single feature authority in Python; persistence in Prisma via API service or direct engine connection (decide once — engine writes through its own Prisma/pg client is acceptable if documented).

### Database Changes
Writes `MarketFeature` at scale; verify unique constraint handles re-runs; no schema change.

### API Changes
```text
POST (ai) /features   (internal)
GET  /api/v1/analysis/:symbol/historical  (similarity now real)
```

### AI/ML Changes
Feature engineering module + manifest + leakage test harness (shared with P13).

### Frontend Changes
None.

### Security Requirements
`as_of` strictly enforced (leakage is a correctness+integrity issue); feature rows carry version for auditability.

### Testing
- [ ] **Leakage tests (mandatory)**: shuffle-detection — features at `t` unchanged when future rows are mutated/deleted; boundary test at exact `t`
- [ ] Unit: each feature family on hand-built fixtures (known values)
- [ ] Unit: missing news/regime inputs → NaN policy documented (imputed with flags, never silently zero)
- [ ] Integration: generate vectors for seeded history → `MarketFeature` rows match manifest count → re-run idempotent
- [ ] Reproducibility: same `as_of` + same inputs → byte-identical vector
- [ ] Regression: P02–P11 tests pass

### Completion Criteria
Versioned, leakage-tested feature vectors exist for all seeded history; manifest committed; similarity search live.

### Phase Output
The dataset substrate for training and inference.

### Next Phase
**PHASE 13 — Machine Learning Pipeline**

---

## PHASE 13 — Machine Learning Pipeline

### Objective
Implement dataset generation, training with walk-forward validation, evaluation, probability calibration, model persistence and versioning — with Logistic Regression, Random Forest and XGBoost compared and **XGBoost selected only if measured best**.

### Why This Phase Exists
This is the credibility core: if training leaks, evaluation lies, or probabilities are uncalibrated, every downstream "72%" is meaningless. The pipeline must be reproducible and documented run-by-run.

### Dependencies
```text
Depends on: PHASE 12
```

### Tasks
- [ ] **Dataset builder**: label = "move ≥ threshold within horizon" (`PREDICTION_THRESHOLD=0.30`, horizons 1h/4h/24h/3d/7d), features from `MarketFeature` + labels from future candles; strict temporal alignment (`feature.t` → `label over (t, t+horizon]`)
- [ ] **Time-series splitting only** — never shuffle: TRAIN ≤2023, VAL 2024, TEST 2025 (configurable), then **walk-forward**: (train 20–22/test 23), (train 20–23/test 24), (train 20–24/test 25)
- [ ] **Trainers**: `train_lr.py`, `train_rf.py`, `train_xgb.py` (XGBoost primary: class weights, early stopping); comparison report produced by `evaluate.py`
- [ ] **Evaluation**: Accuracy, Precision, Recall, F1, ROC-AUC, **Brier score**, reliability table (10 buckets); benchmarks vs baseline models and simple technical strategy
- [ ] **Calibration**: fit Platt/isotonic on VAL; calibrated probability is the only one exposed; calibration curve artifact saved
- [ ] **Registry**: create `ModelVersion` (name, version, featureVersion, trainingDatasetVersion, hyperparams, metrics, status) + `ModelRun` (ranges, seed, artifacts) rows; artifacts to `MODEL_REGISTRY_PATH` (`models/` — gitignored)
- [ ] **Model selection gate**: XGBoost adopted as `ACTIVE` only if it beats baselines on Brier + ROC-AUC on walk-forward folds; otherwise document why another model wins
- [ ] **ML test suite**: leakage (imported from P12), reproducibility (same seed+data → identical metrics), calibration within tolerance, feature correctness spot-checks
- [ ] Training CLI: `python -m app.ml.train --horizon 24h --threshold 0.30` writing registry rows; job wrapper for scheduled retraining (`model-eval` daily)

### Files/Folders
```text
apps/ai-engine/app/ml/{dataset.py, split.py, train.py, models/{logistic.py, random_forest.py, xgboost.py},
                       evaluate.py, calibrate.py, registry.py, cli.py}
apps/ai-engine/tests/{test_dataset.py, test_split_no_shuffle.py, test_reproducibility.py,
                      test_calibration.py, test_leakage.py}
models/ (gitignored artifacts)
```

### Implementation
One pipeline, three model slots, one comparison report, one registry. Deterministic seeds. The `ACTIVE` model is referenced by `DEFAULT_MODEL_NAME/VERSION`.

### Database Changes
Creates rows in `ModelVersion`, `ModelRun` (schema exists from P04).

### API Changes
None user-facing; internal registry queries for `admin/models` (P28).

### AI/ML Changes
**The entire training/evaluation/calibration/registry stack.**

### Frontend Changes
None.

### Security Requirements
Training data path read-only vs production tables; artifacts never contain secrets; model files validated (no arbitrary pickle loading from untrusted paths — prefer joblib within registry dir with checksum).

### Testing
- [ ] **Leakage gate**: test suite fails if any feature row references future data
- [ ] **No-shuffle gate**: splitter provably emits monotonic time folds
- [ ] **Reproducibility gate**: two runs, same seed → identical metrics JSON
- [ ] **Calibration gate**: predicted 0.8 bucket observed frequency within tolerance (e.g. ±10%)
- [ ] Comparison report generated and committed as build artifact (metrics table for docs)
- [ ] Regression: P02–P12 tests pass

### Completion Criteria
Walk-forward-trained, calibrated, versioned models in the registry with documented metrics beating (or honestly not beating) baselines; all ML tests green.

### Phase Output
A reproducible model registry with an `ACTIVE` calibrated model — ready for inference.

### Next Phase
**PHASE 14 — Prediction Engine**

---

## PHASE 14 — Prediction Engine

### Objective
Serve inference: turn live features into structured predictions (direction, calibrated probability, confidence, risk level, model version, timestamp), record every prediction, resolve outcomes, and detect model drift.

### Why This Phase Exists
Predictions are the ML product surface. Without recording and resolving them, the system cannot evaluate itself — violating the core loop *Outcome Tracking → Model Evaluation*.

### Dependencies
```text
Depends on: PHASE 13 (and P08/P09 for live inputs)
```

### Tasks
- [ ] `app/services/predict.py`: load `ACTIVE` model + its exact `featureVersion`; fetch current feature vector; emit structured output per README §13.7 (`symbol, timeframe, direction, probability, confidence, riskLevel, modelVersion`); confidence combines calibrated probability distance-from-0.5 with model reliability + data freshness
- [ ] API `POST /predict` (internal) + `prediction` module: `GET /api/v1/analysis/:symbol` includes prediction; persistence to `Prediction` with `modelRunId`, `featuresSnapshot` (exact inputs — audit requirement)
- [ ] **Outcome tracking job** (`outcomes`, hourly): resolve matured predictions — compute actual move over horizon → `PredictionOutcome` (label, actualMovePct, correct)
- [ ] **Drift detection** (`app/services/drift.py`, daily): rolling-window recent accuracy/Brier vs historical; degradation beyond threshold → `ModelStatus = DRIFT_WARNING` + `SystemEvent` + notification hook (P27) + admin signal (P28); drifting model down-weights or blocks signals per config (never silently continues)
- [ ] Probability **never** converted to guarantee anywhere in serialization
- [ ] Prediction cache (5 min per symbol) with model-version keying
- [ ] Confidence/risk inputs wired for the decision engine (P16)

### Files/Folders
```text
apps/ai-engine/app/services/{predict.py, confidence.py, drift.py}
apps/ai-engine/app/api/routers/predict.py (real)
apps/ai-engine/tests/{test_predict_contract.py, test_drift.py}
apps/api/src/modules/prediction/{prediction.module.ts, controller, service, outcomes.processor.ts}
```

### Implementation
Inference reads model artifact + feature vector; API persists and exposes; jobs close the outcome loop.

### Database Changes
Writes `Prediction`, `PredictionOutcome`; updates `ModelVersion.status` (DRIFT_WARNING). No schema change.

### API Changes
```text
GET  /api/v1/analysis/:symbol             (now includes prediction)
POST (ai) /predict                        (internal)
— admin prediction-performance routes prepared (P28)
```

### AI/ML Changes
Inference, confidence scoring, drift detection, outcome evaluation.

### Frontend Changes
None (P20 displays it).

### Security Requirements
`featuresSnapshot` stored for audit; model artifacts loaded only from registry path; prediction endpoint internal-auth only.

### Testing
- [ ] Contract: prediction JSON matches README §13.7 schema exactly
- [ ] Unit: confidence decreases with stale features / weak probability
- [ ] Unit: drift detector triggers at configured degradation (68%→51% fixture) and does not trigger on noise
- [ ] Integration: predict → persist → simulate horizon → outcome resolved → accuracy recomputed
- [ ] Leakage: outcome resolution uses only post-prediction candles
- [ ] Regression: P02–P13 tests pass

### Completion Criteria
Live predictions recorded with model+feature versions; outcomes resolve automatically; drift warns loudly; probabilities calibrated end-to-end.

### Phase Output
A self-evaluating prediction loop.

### Next Phase
**PHASE 15 — Risk Management Engine**

---

## PHASE 15 — Risk Management Engine

### Objective
Implement the dedicated risk service: position sizing, risk/reward, exposure, drawdown, three profiles, and the full configurable rule engine that can block any order or signal with structured reasons.

### Why This Phase Exists
Risk is the system's conscience. Every order (paper) and every signal (decision engine) must pass through it — so it must exist, be exhaustively tested, **before** the decision engine (P16) and paper trading (P25) are built.

### Dependencies
```text
Depends on: PHASE 07 (routes), PHASE 06 (risk-profile data), PHASE 09 (volatility inputs)
```

### Tasks
- [ ] **Core calculations** (README §14.2): `riskAmount`, `stopDistance`, `positionSize` (with `pointValue`/pip scaling — JPY pairs and crosses covered), `riskReward`, `potentialProfit/Loss`, `portfolioExposure`, drawdown tracker
- [ ] **Profiles**: Conservative/Moderate/Aggressive defaults from README §14.3 seeded in P04; user overrides via `PATCH /users/me/risk-profile` (P06) constrained by hard caps (`MAX_RISK_PER_TRADE_PCT` etc.)
- [ ] **Rule engine** (README §14.4) — each rule a pure function with structured verdict `{rule, severity: PASS|WARN|BLOCK, message, code}`:
  max risk/trade · max daily loss · max open positions · max portfolio exposure · max correlated exposure · max drawdown · min risk/reward · max volatility · news-event restriction (proximity from P11) · confidence threshold · data staleness (from P08) · missing features (from P12)
- [ ] **Verdict aggregation**: any `BLOCK` → overall `NO_TRADE` verdict with reason list (the machine-readable input to P16's NO-TRADE engine)
- [ ] Real route bodies: `POST /risk/calculate` (sizing preview), `GET /risk/rules` (effective rules), `POST /risk/evaluate` (full verdict)
- [ ] Exposure analyzer: per-currency exposure across open positions (`portfolio/exposure` data source for P26; uses seeded/empty positions until P25)
- [ ] Config-driven thresholds from `packages/config` + per-user `RiskProfile`; all documented in API responses

### Files/Folders
```text
apps/api/src/modules/risk/{risk.module.ts, risk.service.ts, sizing.service.ts,
  rules/{rule.interface.ts, risk-per-trade.ts, daily-loss.ts, open-positions.ts,
         exposure.ts, correlation.ts, drawdown.ts, risk-reward.ts, volatility.ts,
         news-event.ts, confidence.ts, staleness.ts, missing-features.ts},
  controller, dto/}
apps/api/src/modules/risk/tests/ (unit specs per rule)
```

### Implementation
Rules are pure, independently testable functions registered in a rule chain; service composes them with the profile + live context.

### Database Changes
Reads `RiskProfile`, `Position` (open positions for exposure — empty until P25). No schema change.

### API Changes
```text
POST /api/v1/risk/calculate
GET  /api/v1/risk/rules
POST /api/v1/risk/evaluate
GET  /api/v1/portfolio/exposure        (endpoint returns real analyzer on empty set)
```

### AI/ML Changes
None (deterministic).

### Frontend Changes
None (P23 UI).

### Security Requirements
Server-authoritative: client-sent position sizes are re-validated server-side; caps cannot be exceeded by profile edits (validation enforces hard limits).

### Testing
- [ ] **Formula unit tests (exhaustive)**: standard lot math, JPY pair (pip 0.01), cross pair, fractional size, zero/negative SL → error, SL=entry → error, R/R boundaries at 1.5
- [ ] Unit: each rule — PASS, WARN, BLOCK fixtures (table-driven)
- [ ] Unit: rule chain aggregation (one BLOCK → NO_TRADE with correct reason codes)
- [ ] Unit: daily-loss/drawdown state machine across simulated sequences
- [ ] Integration: `risk/evaluate` on order violating min-RR → `NO_TRADE_RULE_VIOLATION` with reasons array
- [ ] Regression: P02–P14 tests pass

### Completion Criteria
All formulas and rules proven by unit tests; evaluate endpoint returns structured verdicts; caps enforced.

### Phase Output
A hardened, tested risk authority every trade and signal must obey.

### Next Phase
**PHASE 16 — Decision Engine**

---

## PHASE 16 — Decision Engine

### Objective
Combine technical, historical, ML, news, regime and risk evidence into the weighted 0–100 signal score, produce `LONG|SHORT|WATCH|NO_TRADE` decisions with supporting/contradicting evidence, generate `TradeSignal` records, and power the market scanner.

### Why This Phase Exists
This is the product's central answer — *"what should I do, and why?"* It is the only component permitted to decide. It must sit on top of everything (P08–P15) and below explanation (P17).

### Dependencies
```text
Depends on: PHASE 10, PHASE 11, PHASE 14, PHASE 15
```

### Tasks
- [ ] **Score providers** normalized to 0–100: technical (P10), historical similarity/edge (P09/P12), ML (probability+confidence from P14), news (aggregated sentiment from P11), regime (P10 encoded to score), risk (rule-based score from P15)
- [ ] **Weighted combination** from `packages/config` (defaults: 25/20/25/10/10/10) — configurable, versioned with the signal (`weights` snapshot in scores JSON)
- [ ] **Band mapping** per README §15.2: 80–100 Strong · 70–79 Good · 60–69 Watch · 50–59 Weak · <50 Avoid (configurable thresholds)
- [ ] **Direction logic**: ML direction + technical/news bias alignment → `LONG`/`SHORT`/`NEUTRAL`; conflicts reduce score
- [ ] **NO-TRADE engine** (README §15.3): hard gates from P15 verdicts + soft gates (model disagreement, unusual regime, insufficient historical evidence, low confidence) → action `NO_TRADE` with machine-readable `noTradeReasons[]`
- [ ] **Evidence assembly**: `supporting[]` / `contradicting[]` evidence items (structured: `{source, claim, value}`) — the payload P17 explains
- [ ] `signals` module real: signal generation job (`signals`, triggered after features/predictions refresh) → persist `TradeSignal` + `SignalFeature` snapshot; `GET /signals`, `GET /signals/:id` (full evidence)
- [ ] **Scanner**: `GET /scanner` — all active pairs scored, sortable by score/probability/risk/volatility, filters; Redis-cached 5 min; `signal:new`/`signal:changed` WS emissions on material change
- [ ] Weight configuration exposed to admin (P28) + backtest comparison hook (P24 validates weights)

### Files/Folders
```text
apps/api/src/modules/signals/{signals.module.ts, decision.engine.ts,
  scoring/{weights.ts, technical.score.ts, historical.score.ts, ml.score.ts,
           news.score.ts, regime.score.ts, risk.score.ts},
  no-trade.ts, evidence.ts, bands.ts, scanner.service.ts, signal.controller.ts,
  jobs/signal-generation.processor.ts}
apps/api/src/signals/tests/{decision.test.ts, no-trade.test.ts, bands.test.ts}
```

### Implementation
Pure deterministic engine: inputs (evidence bundle) → verdict (score, action, evidence, reasons). No LLM anywhere in this path.

### Database Changes
Writes `TradeSignal`, `SignalFeature`. No schema change.

### API Changes
```text
GET /api/v1/signals | /signals/:id        (real)
GET /api/v1/scanner?sortBy=…&order=…      (real, cached)
WS  signal:new · signal:changed           (emitting)
```

### AI/ML Changes
None (consumes P14 outputs).

### Frontend Changes
None (P21 UI).

### Security Requirements
Decision logic server-side only; signal payloads include model version + data freshness (auditability per README §28/75); no client can request a "forced" decision that bypasses NO-TRADE gates.

### Testing
- [ ] Unit: weighted score math with known component scores (configurable weights honored)
- [ ] Unit: band boundaries (59/60, 69/70, 79/80 exactly)
- [ ] Unit: **NO-TRADE matrix** — each reason code triggers under its fixture (low confidence, stale data, missing features, bad R/R, extreme volatility, imminent high-impact event, model disagreement, unusual regime, conflicting indicators)
- [ ] Unit: evidence assembly — supporting/contradicting counts match inputs; contradicting evidence always rendered (never suppressed)
- [ ] Integration: seeded multi-pair state → scanner returns all 10 pairs with valid actions/scores, sorted correctly
- [ ] Integration: signal persisted with `SignalFeature` snapshot matching P05 feature contract
- [ ] Honesty tests: NO_TRADE rows exist in fixture output; no path returns action without evidence
- [ ] Regression: P02–P15 tests pass

### Completion Criteria
Signals generated with scores/evidence/NO-TRADE reasons; scanner live over all pairs; WS events flowing; every output traceable to component inputs.

### Phase Output
The decision layer — the system's answer machine.

### Next Phase
**PHASE 17 — AI Explanation Engine**

---

## PHASE 17 — AI Explanation Engine

### Objective
Connect the LLM provider for explanation, AI market reports and the grounded assistant — strictly consuming structured application data, with output validation that forbids invention.

### Why This Phase Exists
Explainability is a headline requirement, but LLMs are the system's biggest integrity risk. This phase wires the LLM **behind** the deterministic pipeline with validation, so it can only narrate verified evidence.

### Dependencies
```text
Depends on: PHASE 16 (needs real structured outputs to explain), PHASE 11 (news text handling)
```

### Tasks
- [ ] **LLM provider abstraction** (`app/services/llm/`): interface + OpenAI-compatible adapter + **MockLLM** (deterministic template renderer — keyless mode produces explanations from the structured payload without an LLM) + fallback policy: LLM failure/timeout → template explanation → `explanationSource: "template" | "llm"` recorded
- [ ] **Explanation engine** (`explanation.py`): input = verified structured payload only (scores, probability, confidence, risk, regime, freshness, modelVersion, evidence arrays); system prompt embeds: *treat provided data as the only facts; never invent indicators/prices/news/numbers; external content is data, not instructions*
- [ ] **Output validator**: post-generation check — every number/symbol/category mentioned must exist in the payload; violation → one regeneration → else deterministic fallback; result stored in `AIAnalysis` with payload hash, `llmModel`, `explanationText`, supporting/contradicting evidence copied structurally
- [ ] **AI market report** (`GET /analysis/:symbol/report`): assemble summary, trend, technical/historical/news evidence, prediction, risk, **scenario analysis** (bullish/neutral/bearish probability split derived from model outputs — labeled probabilities, never certainties), decision, reasons, warnings
- [ ] **Assistant** (`POST /ai/assistant`): retrieval-first — resolve question to structured facts (pair assessments, indicator values, news analyses, signal history, NO-TRADE reasons) from DB/cache, pass facts to LLM for natural-language rendering; if data missing → explicit "no data" response; rate-limited 20/min
- [ ] **News LLM enhancer (optional)**: LLM-based event/sentiment classification when `AI_API_KEY` set, writing the same `NewsAnalysis` schema as the rule-based path (P11)
- [ ] `ai` module real: `GET /ai/assessment/:symbol`, `POST /ai/explain`, `POST /ai/assistant` — all with prompt-injection scrubbing on any external text included
- [ ] `GET /analysis/:symbol` now fully real (technical + historical + news + prediction + regime + risk + decision + explanation)

### Files/Folders
```text
apps/ai-engine/app/services/llm/{base.py, openai_adapter.py, mock_llm.py, prompts.py}
apps/ai-engine/app/services/{explanation.py, report.py, assistant.py, validate_explanation.py}
apps/ai-engine/app/api/routers/{explain.py (real), assistant internal}
apps/ai-engine/tests/{test_explanation_validation.py, test_prompt_injection.py, test_mock_llm.py}
apps/api/src/modules/ai/{ai.module.ts, controller, service, report.service.ts}
```

### Implementation
Deterministic-first: MockLLM keeps the entire product functional keyless; real LLM slot upgrades quality without changing contracts.

### Database Changes
Writes `AIAnalysis`. No schema change.

### API Changes
```text
GET  /api/v1/ai/assessment/:symbol
POST /api/v1/ai/explain | /ai/assistant
GET  /api/v1/analysis/:symbol             (fully real)
GET  /api/v1/analysis/:symbol/report      (real)
```

### AI/ML Changes
LLM explanation/report/assistant services + output validation + injection defenses.

### Frontend Changes
None (P19/P20 render these).

### Security Requirements
Prompt-injection scrubbing on all external text; output grounding validation; token/cost caps; timeout → fallback; API key server-side; assistant answers only from application data (fabrication test required); audit of LLM calls (payload hash, model, latency).

### Testing
- [ ] Unit: validator accepts grounded explanation, rejects fabricated number/symbol
- [ ] Unit: injection fixture in news text cannot alter system instructions (assert output unaffected)
- [ ] Unit: MockLLM template renders payload correctly keyless
- [ ] Integration: assessment endpoint returns full README §12.3 structure (decision, supporting, contradicting, freshness, modelVersion, timestamp)
- [ ] Integration: report contains scenario probabilities summing to 100 and labeled as probabilities
- [ ] Assistant: question about missing data → explicit no-data answer (fabrication guard)
- [ ] Regression: P02–P16 tests pass

### Completion Criteria
Every recommendation carries a validated explanation; reports and assistant work keyless (template) and upgraded (LLM); no fabrication possible without test failure.

### Phase Output
The explainability layer — closing the pipeline to the user.

### Next Phase
**PHASE 18 — Frontend Foundation** (Track B; may have started earlier against P07 contracts)

---

## PHASE 18 — Frontend Foundation

### Objective
Build the design system, application shell, navigation, API/WS client layer, auth-complete UI and all shared states (loading/error/empty) — the professional dark institutional look of README §18.

### Why This Phase Exists
Twelve feature screens (P19–P28) will be assembled from these primitives. Without a strict design system first, the UI devolves into the "generic dashboard template" the project forbids.

### Dependencies
```text
Depends on: PHASE 06 (auth flows), PHASE 07 (API contracts) — NOT on Track A completion
```

### Tasks
- [ ] **Tokens** (README §18.1) in Tailwind config: colors (`#080B10`, `#10151C`, `#202832`, `#F5F7FA`, `#94A3B8`, `#22C55E`, `#EF4444`, `#F59E0B`, `#38BDF8`), spacing scale, radii, borders, typography scale; no gradients/glassmorphism
- [ ] **shadcn/ui** primitives installed and themed (button, input, dialog, dropdown, tabs, table, tooltip, badge, toast, skeleton, sheet, select, switch)
- [ ] **App shell**: sidebar nav (Dashboard, Markets, Scanner, News, Risk, Backtesting, Paper Trading, Portfolio, Watchlist, Notifications, AI Assistant, Admin[role-gated]), top bar (search, freshness indicator, user menu), breadcrumbs
- [ ] **API client**: TanStack Query setup with envelope unwrapping, typed errors → toast mapping, auth token/refresh handling, request-ID surfaced in error UI, global staleTime/retry policy
- [ ] **WebSocket client**: reconnecting subscription helper, event router → query-cache invalidation
- [ ] **Auth UI completion**: protected layouts, role-gated nav, session hook (P06 pages hardened)
- [ ] **Shared state components**: `Loading` (skeletons matched to each layout), `ErrorState` (envelope code + requestId + retry), `EmptyState` (honest "no data yet" copy), `StaleBanner` (data-freshness warnings)
- [ ] **Financial primitives**: `DataCard`, `MetricRow`, `ScoreBadge` (band colors **+ text**, never color-only), `RiskChip`, `ProbabilityMeter`, `DataTable` (compact, sortable, virtualized), `PairLink`
- [ ] **Responsive**: desktop full experience; mobile prioritization (watchlist, signals, risk, charts, alerts, AI summary) with collapsible nav
- [ ] **Accessibility**: keyboard navigation, ARIA labels, focus rings, contrast ≥4.5:1, `prefers-reduced-motion`
- [ ] Zustand stores: session, UI prefs (density, timezone), scanner filters

### Files/Folders
```text
apps/web/src/
  app/{layout.tsx, (auth)/*, (dashboard)/layout.tsx}
  components/ui/*            (shadcn)
  components/{DataCard, ScoreBadge, RiskChip, ProbabilityMeter, DataTable,
              Loading, ErrorState, EmptyState, StaleBanner, PairLink}.tsx
  lib/api/{client.ts, query.ts, hooks/*.ts, errors.ts}
  lib/ws/{socket.ts, router.ts}
  stores/{session.ts, ui.ts, scanner.ts}
  hooks/{useSession.ts, useQuote.ts, useMediaQuery.ts}
  tailwind.config.ts · src/app/globals.css
```

### Implementation
Visual foundation + client infrastructure. Every component storybook-documented or demo-rendered on a `/dev/ui` route (dev-only, removed in P41 if undesired — or kept behind role gate).

### Database Changes
None.

### API Changes
None (consumes P06/P07).

### AI/ML Changes
None.

### Frontend Changes
**All of the above** — shell, primitives, clients, auth UI, responsive/a11y baseline.

### Security Requirements
Tokens never in localStorage; refresh via httpOnly cookie only; no secrets in `NEXT_PUBLIC_*` except app URL; CSP-compatible chart rendering; role checks mirrored client-side *and* server-side (never client-only).

### Testing
- [ ] Component tests (Testing Library): primitives render states; ScoreBadge shows text+color; ErrorState renders code+requestId
- [ ] Unit: API client envelope unwrap + error mapping + refresh retry logic
- [ ] E2E: login → shell renders → role-gated admin link hidden for USER → logout
- [ ] A11y: axe scan on shell + auth pages passes; keyboard-only navigation works
- [ ] Regression: all previous tests pass

### Completion Criteria
A polished, responsive, accessible shell with working auth UI and tested API/WS client — ready for feature screens.

### Phase Output
The design system and client infrastructure for the entire frontend.

### Next Phase
**PHASE 19 — Dashboard**

---

## PHASE 19 — Dashboard

### Objective
Implement the main dashboard (README §18.2) wired to **real** backend APIs — market overview, top opportunities, sentiment, AI confidence, risk overview, watchlist, news, economic events, portfolio and recent assessments.

### Why This Phase Exists
The dashboard is the product's front door and the first proof that the full pipeline (data → signals → explanation) reaches the user coherently. No fake production data is permitted — empty states are honest.

### Dependencies
```text
Depends on: PHASE 18, PHASE 16 (scanner/signals), PHASE 08 (quotes)
```

### Tasks
- [ ] **Market overview strip**: latest quotes for 10 pairs, change %, staleness indicators (`quote:update` live)
- [ ] **Top opportunities**: scanner's best scores (score/probability/risk columns, action badges)
- [ ] **Market sentiment**: aggregate long/short/watch/no-trade distribution from signals
- [ ] **AI confidence panel**: latest prediction confidences + model version display
- [ ] **Risk overview**: open positions, daily P/L vs limit, exposure warnings (per-currency chips)
- [ ] **Watchlist widget**: live scores/probabilities/risk per item (from P26 data; honest empty state before)
- [ ] **Latest news + economic events**: P11 data with impact badges and time-relative formatting
- [ ] **Portfolio snapshot**: balance/equity/P&L mini-chart (empty-state until P25)
- [ ] **Recent AI assessments**: last N `AIAnalysis` summaries with decision badges
- [ ] Layout: precise grid, compact typography, restrained animation (number transitions only), loading/error/empty per widget
- [ ] WS integration: quotes + signal changes refresh widgets without full reload

### Files/Folders
```text
apps/web/src/app/(dashboard)/dashboard/page.tsx
apps/web/src/components/dashboard/{MarketOverview, TopOpportunities, SentimentBar,
  ConfidencePanel, RiskOverview, WatchlistWidget, NewsFeed, EventCalendar,
  PortfolioSnapshot, RecentAssessments}.tsx
apps/web/src/lib/api/hooks/{useScanner, useQuotes, useNews, usePortfolio, useAssessments}.ts
```

### Implementation
Compose P18 primitives; each widget its own query with independent loading/error/empty states.

### Database Changes
None.

### API Changes
Consumes: `/market/overview`, `/scanner`, `/news`, `/news/events`, `/portfolio`, `/signals`, `/ai/*`. Gaps surface as empty/error states — **never mock rows**.

### AI/ML Changes
None.

### Frontend Changes
Full dashboard page + 10 widgets.

### Security Requirements
Admin-only widgets role-gated; no client-side decision logic (dashboard only renders server verdicts).

### Testing
- [ ] Component: each widget renders loading → data → empty states correctly
- [ ] E2E: dashboard loads with real backend (integration env), quotes tick, no console errors
- [ ] A11y: full-page axe pass
- [ ] Regression: previous tests pass

### Completion Criteria
Dashboard fully populated from real APIs in dev environment; honest empty states pre-feature; live updates working.

### Phase Output
The product front door, end-to-end.

### Next Phase
**PHASE 20 — Market Analysis UI**

---

## PHASE 20 — Market Analysis UI

### Objective
Build `/markets/[symbol]` (README §18.4): professional candlestick chart with overlays and subcharts, plus the Technical / Historical / News / AI Forecast / Risk / Decision sections and the AI market report view.

### Why This Phase Exists
This is the deepest analytical surface — where chart, evidence, prediction, risk and decision come together with ACTUAL vs SCENARIO clarity.

### Dependencies
```text
Depends on: PHASE 18, PHASE 10, PHASE 17 (assessment/report), PHASE 09 (candles)
```

### Tasks
- [ ] **Chart component** (TradingView Lightweight Charts): candlesticks; overlays — EMA20/50/200, SMA, Bollinger Bands, support/resistance lines, entry zone, stop-loss, take-profit levels; subcharts — RSI, MACD, ATR; timeframe switcher (1m…1D) bound to `/market/candles`
- [ ] **Scenario rendering**: model projections drawn **dashed + distinct color + legend "MODEL SCENARIO (not actual price)"**; actual data solid; never imply forecast certainty
- [ ] **Header metrics**: price, change, trend, regime, AI probability, confidence, risk, technical score, historical score, news sentiment, volatility — each with freshness
- [ ] **Sections**: Price Chart · Technical Analysis (indicator table + pattern list with context) · Historical Analysis (similarity, past behavior, volatility stats) · News Intelligence (related articles + sentiment) · AI Forecast (prediction + scenarios + explanation) · Risk Analysis (rules, sizing preview via `risk/calculate`) · Decision (big action badge + supporting/contradicting evidence + NO-TRADE reasons when applicable)
- [ ] **AI report view**: rendered markdown report from `/analysis/:symbol/report` with scenario percentages
- [ ] Symbol search/switcher (pair picker with keyboard nav)
- [ ] Mobile: chart collapsible, metrics prioritized (summary → decision → chart)

### Files/Folders
```text
apps/web/src/app/(dashboard)/markets/[symbol]/page.tsx
apps/web/src/components/charts/{PriceChart, SubChart, Overlays, ScenarioLayer, ChartLegend}.tsx
apps/web/src/components/analysis/{PairHeader, TechnicalSection, HistoricalSection,
  NewsSection, ForecastSection, RiskSection, DecisionSection, EvidenceList, AiReportView}.tsx
apps/web/src/lib/api/hooks/{useCandles, useAssessment, useReport}.ts
```

### Implementation
Data-dense but legible; all numbers from API; decision section renders NO TRADE as prominently as LONG/SHORT.

### Database Changes
None.

### API Changes
Consumes `/market/candles`, `/analysis/:symbol/*`, `/news/sentiment/:symbol`, `/risk/calculate`.

### AI/ML Changes
None.

### Frontend Changes
Analysis page + chart stack + 8 section components.

### Security Requirements
Scenario layer must not be styled as guaranteed; forecast disclaimers rendered (not just decorative).

### Testing
- [ ] Component: overlays add/remove; scenario series visually flagged (class/legend assertion)
- [ ] Unit: candle→series mapping, timezone handling
- [ ] E2E: open EUR/USD → chart renders candles → switch timeframe → sections populate → decision badge matches API
- [ ] A11y: chart has text alternative (price table) for screen readers
- [ ] Regression: previous tests pass

### Completion Criteria
Full analysis page live on real data with compliant scenario visualization.

### Phase Output
The flagship analytical screen.

### Next Phase
**PHASE 21 — Market Scanner**

---

## PHASE 21 — Market Scanner

### Objective
Build the scanner screen: all supported pairs ranked by decision-engine score, with filters by action/risk/timeframe and sorts by score, probability, risk and volatility.

### Why This Phase Exists
The scanner converts per-pair analysis into an at-a-glance opportunity map — a core differentiator of the platform — and is the natural companion to signals consumption.

### Dependencies
```text
Depends on: PHASE 18, PHASE 16 (scanner API)
```

### Tasks
- [ ] Scanner table: pair, action badge (incl. NO TRADE), score (band-colored + text), probability, confidence, risk, volatility, regime, trend, sentiment, freshness
- [ ] Actions: sort by score/probability/risk/volatility; filter by action/risk/timeframe; persist filters in Zustand + URL
- [ ] Special views: **Best opportunity** (max score), **Lowest risk**, **Highest confidence**, **Most volatile**, **No-trade pairs** (explicit section — NO TRADE presented as a first-class result, not hidden)
- [ ] Drill-down: row click → `/markets/[symbol]`
- [ ] WS updates: `signal:new`/`signal:changed` update rows live; row flash on change (restrained animation)
- [ ] Cache-aware: shows `as of <time>` + stale indicator from server envelope

### Files/Folders
```text
apps/web/src/app/(dashboard)/scanner/page.tsx
apps/web/src/components/scanner/{ScannerTable, ScoreCell, ActionBadge, ScannerFilters,
                                  NoTradeSection, ScannerToolbar}.tsx
```

### Implementation
Read-only rendering of `/scanner` with client-side sort/filter; decision authority stays 100% server-side.

### Database Changes
None.

### API Changes
Consumes `GET /api/v1/scanner`, WS `signal:*`.

### AI/ML Changes
None.

### Frontend Changes
Scanner page + table components + special views.

### Security Requirements
Row-level access is the same for all authenticated users (public market data); no per-pair authorization complexity introduced.

### Testing
- [ ] Component: score bands render correct colors + text; NO TRADE rows styled like other actions
- [ ] E2E: scanner loads all pairs → sort changes order → filter hides rows → drill-down navigates
- [ ] WS: fixture `signal:changed` updates row without reload
- [ ] A11y: sortable table usable via keyboard
- [ ] Regression: previous tests pass

### Completion Criteria
Scanner live with correct ordering, filters and live updates.

### Phase Output
The opportunity map screen.

### Next Phase
**PHASE 22 — News Interface**

---

## PHASE 22 — News Interface

### Objective
Build the news screen and economic-event calendar consuming the structured news intelligence endpoint, with sentiment/impact visualization and pair filtering.

### Why This Phase Exists
News evidence is 10% of decisions and a headline feature; the UI must present structured, classified news (not raw feeds) and make event risk visible.

### Dependencies
```text
Depends on: PHASE 18, PHASE 11
```

### Tasks
- [ ] News list: article, source, time (relative + absolute), sentiment badge, impact badge, affected currencies, confidence
- [ ] Filters: currency, sentiment, impact; pagination via cursor
- [ ] Economic calendar: upcoming events sorted by time; impact badges; timezone local-aware; "minutes to event" chip; HIGH/EXTREME highlighted (text + color)
- [ ] Pair sentiment drill-down (from `/news/sentiment/:symbol`) with recent-article evidence list
- [ ] Empty/error/loading states for feed, calendar, sentiment

### Files/Folders
```text
apps/web/src/app/(dashboard)/news/page.tsx
apps/web/src/components/news/{NewsFeed, ArticleCard, ImpactBadge, SentimentBadge,
                               EventCalendar, EventRow, PairSentimentPanel, NewsFilters}.tsx
```

### Implementation
Renders P11 structured output only; never renders raw article HTML.

### Database Changes
None.

### API Changes
Consumes `/news`, `/news/events`, `/news/sentiment/:symbol`.

### AI/ML Changes
None.

### Frontend Changes
News + calendar screens.

### Security Requirements
Article content rendered as escaped text only (no raw HTML — XSS); injection-neutralized content displayed as-is with a "verified analysis" label.

### Testing
- [ ] Component: badges map enums → text+color; calendar sorts correctly
- [ ] E2E: filters work over fixture news API; HIGH impact events visible
- [ ] Security: XSS fixture article renders as inert text (CSP + escaping asserted)
- [ ] Regression: previous tests pass

### Completion Criteria
News intelligence fully browsable with event-risk visibility.

### Phase Output
The news/economic intelligence screen.

### Next Phase
**PHASE 23 — Risk Interface**

---

## PHASE 23 — Risk Interface

### Objective
Build the risk screen: current profile, effective rules, position-sizing calculator, rule-evaluation results and portfolio exposure.

### Why This Phase Exists
Risk transparency is a core promise — the user must see the rules *before* the trade, and the calculator gives a safe way to explore sizing.

### Dependencies
```text
Depends on: PHASE 18, PHASE 15
```

### Tasks
- [ ] Profile card: current profile, editable within hard caps (`PATCH /users/me/risk-profile`), cap validation errors surfaced
- [ ] Rules table: each applicable rule, its threshold, current value, verdict (PASS/WARN/BLOCK with text+color)
- [ ] **Sizing calculator**: entry/SL/TP/balance inputs → live `risk/calculate` → position size, risk amount, R/R, potential P/L; NO-TRADE reasons shown when evaluate blocks
- [ ] Exposure panel: per-currency exposure with HIGH/MEDIUM/LOW warnings (text + color)
- [ ] Savings-style clarity: every number labeled with units; JPY/cross-pair point math explained inline

### Files/Folders
```text
apps/web/src/app/(dashboard)/risk/page.tsx
apps/web/src/components/risk/{ProfileCard, RulesTable, SizingCalculator,
                              ExposurePanel, VerdictBadge}.tsx
```

### Implementation
Forms via React Hook Form + shared Zod schemas; server-side validation results surfaced 1:1.

### Database Changes
None.

### API Changes
Consumes `/risk/*`, `/portfolio/exposure`, `PATCH /users/me/risk-profile`.

### AI/ML Changes
None.

### Frontend Changes
Risk screen.

### Security Requirements
Caps enforced server-side; the UI must display server rejection — never silently accept client-side-computed sizes as authoritative.

### Testing
- [ ] Component: calculator valid + invalid states; cap overrides rejected with message
- [ ] E2E: change profile → rules table reflects new thresholds
- [ ] Unit: exposure warning maps currency value → label threshold
- [ ] Regression: previous tests pass

### Completion Criteria
Users can see, configure and test risk rules live.

### Phase Output
The risk transparency screen.

### Next Phase
**PHASE 24 — Backtesting**

---

## PHASE 24 — Backtesting

### Objective
Implement the backtesting engine (backend: execution-simulated replay; frontend: configuration and results) with falsifiable, lookahead-free semantics and complete metrics.

### Why This Phase Exists
Backtesting validates the decision engine and risk rules on history, and is a required user feature. It must be built so it *cannot* peek at future data — this is a correctness guarantee, not a preference.

### Dependencies
```text
Depends on: PHASE 16 (strategy=the decision engine), PHASE 15 (sizing), PHASE 09 (history)
```

### Tasks
- [ ] **Simulation service** (NestJS `backtesting` module): config → load candles (projection) → warm-up indicators on pre-range data → replay bars chronologically
- [ ] **Signal replay**: run the P16 decision engine bar-by-bar using only data ≤ current bar (reuse signals engine with `as_of` semantics)
- [ ] **Sizing**: through P15 risk engine (same rules as paper trading)
- [ ] **Fills**: configurable spread (`spreadPipsTypical` + slippage parameter), SL/TP checking on high/low (conservative fill assumption), position close on opposite signal or range end
- [ ] **Metrics** (README §16.3): trades, wins, losses, net return, profit factor, max drawdown, Sharpe, Sortino, expectancy, avg win/loss, equity curve points; benchmark comparison (simple technical strategy / random baseline)
- [ ] Queue: BullMQ `backtest` job (statuses QUEUED→RUNNING→COMPLETED/FAILED); results persisted `Backtest` + `BacktestTrade`
- [ ] **Anti-lookahead audit row**: backtest records `lastBarTimestamp` per trade decision; test asserts decision ≤ fill
- [ ] **UI**: `/backtesting` — config form (symbol, strategy=decision engine, date range, capital, risk %, timeframe), run status polling, results dashboard (metrics cards + equity curve chart + trades table), explicit "historical simulation — past performance does not guarantee future results" banner
- [ ] Result history list (own runs)

### Files/Folders
```text
apps/api/src/modules/backtesting/{backtesting.module.ts, backtest.service.ts,
  engine/{replay.ts, fills.ts, metrics.ts, equity-curve.ts},
  jobs/backtest.processor.ts, controller, dto/}
apps/api/src/modules/backtesting/tests/{test_replay_no_lookahead.ts, test_fills.ts,
  test_metrics.ts}
apps/web/src/app/(dashboard)/backtesting/page.tsx · components/backtesting/*.tsx
```

### Implementation
Metrics identities: `profitFactor = grossProfit/grossLoss`, `Sharpe = mean(return)/std(return)×√n`, `maxDrawdown` from equity curve. All unit-tested against hand-computed fixtures.

### Database Changes
Writes `Backtest`, `BacktestTrade`. No schema change.

### API Changes
```text
POST /api/v1/backtests · GET /backtests · GET /backtests/:id
```

### AI/ML Changes
None (consumes decision engine deterministically).

### Frontend Changes
Config form, results dashboard, equity curve chart, trade table.

### Security Requirements
Range/capital bounds validated to prevent resource abuse; jobs isolated per user.

### Testing
- [ ] **No-lookahead gate**: instrumented replay fixture where decision at bar *t* correctly uses bar *t*'s close as latest info; a mutation that would require *t+1* data fails the test
- [ ] Unit: fills honor SL before TP on same-bar high/low per conservative rule
- [ ] Unit: metrics match hand-computed values on a 3-trade fixture (PF, Sharpe, Sortino, expectancy, MDD)
- [ ] Integration: run a full backtest job → COMPLETED → results persisted → API returns
- [ ] Regression: P02–P23 tests pass

### Completion Criteria
Backtests run end-to-end with provable no-lookahead behavior and correct metrics.

### Phase Output
A credible historical validation tool.

### Next Phase
**PHASE 25 — Paper Trading**

---

## PHASE 25 — Paper Trading

### Objective
Implement simulated trading (backend order lifecycle + UI): $10,000 virtual account, LONG/SHORT orders, SL/TP, position sizing via the risk engine, and full P/L tracking.

### Why This Phase Exists
Paper trading closes the loop begun at P15/P16 and gives users the "accept/reject paper trade → track outcome" journey without any real funds.

### Dependencies
```text
Depends on: PHASE 15 (risk), PHASE 16 (signals), PHASE 08 (live quotes)
```

### Tasks
- [ ] **Order lifecycle** (NestJS `paper-trading` module): open position (LONG/SHORT, entry/SL/TP/size) → risk-engine evaluate (any BLOCK → `NO_TRADE_RULE_VIOLATION` with reasons) → persist `Position(OPEN)` → mark-to-market on quote updates/SL-TP checks → CLOSED with realized P/L
- [ ] **MTM job**: per-quote-update or ticked job evaluates open positions against live price; SL/TP honored conservatively (intrabar high/low for active bars in absence of tick data — documented assumption)
- [ ] **Signals intake**: "accept signal" flow opens a position pre-filled from a `TradeSignal` (entry/SL/TP/size), re-validated by risk engine at open
- [ ] **Account model**: `Portfolio(balance=10000)` + equity, unrealized/realized P/L, drawdown, win rate, profit factor tracked and persisted
- [ ] **Real API bodies**: `GET /account`, `GET /positions`, `POST /positions`, `PATCH /positions/:id` (SL/TP), `DELETE /positions/:id` (close at market)
- [ ] **UI** `/paper-trading`: account summary cards (balance, equity, unrealized, realized, drawdown, WR, PF), open positions table (live P/L via WS `position:update`), close/modify actions, order form, trade history
- [ ] **No real-money execution anywhere** (nothing to bridge; documented)
- [ ] WS: `position:update` emissions on MTM changes

### Files/Folders
```text
apps/api/src/modules/paper-trading/{paper-trading.module.ts, account.service.ts,
  order.service.ts, mtm.service.ts, positions.service.ts, controller, dto/}
apps/api/src/jobs/processors/mtm.processor.ts
apps/web/src/app/(dashboard)/paper-trading/page.tsx · components/paper-trading/*.tsx
```

### Implementation
Same risk engine, same signals engine, conservative fills; every state transition auditable and persisted.

### Database Changes
Writes `Portfolio`, `Position` (+ `AuditLog` TRADE_OPEN/TRADE_CLOSE). No schema change.

### API Changes
```text
GET  /api/v1/paper-trading/account
GET  /api/v1/paper-trading/positions
POST /api/v1/paper-trading/positions
PATCH/DELETE /api/v1/paper-trading/positions/:id
WS   position:update
```

### AI/ML Changes
None.

### Frontend Changes
Paper trading screen + order form + history.

### Security Requirements
Server-authoritative sizing; positions owned by user (per-row authorization); no client-influenced pricing.

### Testing
- [ ] Unit: MTM math — LONG/SHORT P/L sign correctness, JPY pair scaling
- [ ] Unit: SL/TP hit ordering; same-bar SL+TP → conservative SL order
- [ ] Unit: account metrics (balance, equity, drawdown, WR, PF) after scripted trade sequence
- [ ] Integration: risk-blocked order returns `NO_TRADE_RULE_VIOLATION`; valid order opens; close realizes correct P/L
- [ ] E2E: open signal-triggered paper trade → WS updates → close → portfolio updates
- [ ] Regression: P02–P24 tests pass

### Completion Criteria
Full simulated trading lifecycle works with correct accounting.

### Phase Output
A working paper-trading vertical slice.

### Next Phase
**PHASE 26 — Portfolio & Watchlist**

---

## PHASE 26 — Portfolio & Watchlist

### Objective
Build the portfolio page (balance, equity, exposure, risk, P/L, drawdown, correlation, warnings) and the watchlist feature (add/remove/reorder/alerts/score view).

### Why This Phase Exists
Portfolio exposure and correlation are the portfolio-level risk surfaces; watchlist is the fastest path to per-pair follow-up. Both round out the trading experience.

### Dependencies
```text
Depends on: PHASE 25, PHASE 16 (signal scores), PHASE 18
```

### Tasks
- [ ] **Portfolio API**: `GET /portfolio` — totals, equity, exposure % , P/L, drawdown, correlation matrix (pair returns), risk aggregates; `GET /portfolio/exposure` per-currency warnings
- [ ] Portfolio UI: metric cards, equity mini-chart, exposure bars with HIGH/MEDIUM/LOW warnings, correlation heatmap (text + color)
- [ ] **Watchlist API**: `GET/POST/DELETE /watchlist` + items, `PATCH` reorder (`sortOrder`), alerts CRUD
- [ ] Watchlist UI: reorder (drag + keyboard), live score/probability/risk columns, set price/signal alerts
- [ ] Wire dashboard watchlist widget (P19) to real data
- [ ] Alert config persisted for P27 fan-out

### Files/Folders
```text
apps/api/src/modules/portfolio/{portfolio.module.ts, service, controller, exposure.service.ts,
  correlation.service.ts}
apps/api/src/modules/watchlist/{watchlist.module.ts, service, controller, dto/}
apps/web/src/app/(dashboard)/{portfolio,watchlist}/page.tsx · components/{portfolio,watchlist}/*.tsx
```

### Implementation
Portfolio math computed server-side from open positions + quotes; correlation from daily return history (P09).

### Database Changes
Writes `Watchlist(Item)`, reads `Position`/`Portfolio`. No schema change.

### API Changes
```text
GET  /api/v1/portfolio | /portfolio/exposure
GET/POST/DELETE /api/v1/watchlist | /watchlist/items
PATCH /api/v1/watchlist/items/:id   (reorder/alerts)
```

### AI/ML Changes
None.

### Frontend Changes
Portfolio page, watchlist page, correlation heatmap.

### Security Requirements
User-scoped queries (never query positions across users); watchlist items owned.

### Testing
- [ ] Unit: exposure aggregation per currency; warning thresholds
- [ ] Unit: correlation matrix on fixture returns
- [ ] Integration: watchlist CRUD + reorder + ownership isolation
- [ ] E2E: add pair to watchlist → appears in dashboard widget with live score
- [ ] Regression: previous tests pass

### Completion Criteria
Portfolio risk surface complete; watchlist fully functional and integrated.

### Phase Output
Portfolio & watchlist features.

### Next Phase
**PHASE 27 — Notifications**

---

## PHASE 27 — Notifications

### Objective
Implement the notification service (in-app first, channel abstraction for email/push/SMS later) covering all seven notification types and the delivery pipeline.

### Why This Phase Exists
Notifications surface signals, risk and event changes that would otherwise be missed; the provider abstraction preserves future extensibility.

### Dependencies
```text
Depends on: PHASE 11 (news/events), PHASE 16 (signals), PHASE 26 (alerts)
```

### Tasks
- [ ] `NotificationChannel` interface + `InAppChannel` implementation (email/push/SMS slots as documented extension points, not fake)
- [ ] Producer hooks: signal new/changed (`SIGNAL_CHANGED`), confidence threshold crossing (`CONFIDENCE_CHANGED`), risk verdict change (`RISK_CHANGED`), high-impact news (`NEWS_ALERT`), upcoming economic event (`ECONOMIC_EVENT`), price alert (`PRICE_ALERT` from P26 alerts), regime change (`REGIME_CHANGED`)
- [ ] **Notification service** (NestJS): dedupe (same type+key within TTL), user preferences, read/unread, pagination, WS `notification:new`
- [ ] UI `/notifications`: list, unread badges (nav + dashboard), mark read, filter by type
- [ ] Admin visibility: notification volume metric (P28/P33)

### Files/Folders
```text
apps/api/src/modules/notifications/{notifications.module.ts, service, controller,
  channels/{channel.interface.ts, in-app.channel.ts},
  emitters/{signal.emitter.ts, news.emitter.ts, price-alert.emitter.ts, regime.emitter.ts}}
apps/api/src/jobs/processors/{notification.processor.ts, price-alert.processor.ts}
apps/web/src/components/notifications/*.tsx · app/(dashboard)/notifications/page.tsx
```

### Implementation
Producers enqueue; worker persists via channel(s); in-app channel delivers rows + WS event.

### Database Changes
Writes `Notification`. No schema change.

### API Changes
```text
GET  /api/v1/notifications
PATCH /api/v1/notifications/:id/read
WS   notification:new
```

### AI/ML Changes
None.

### Frontend Changes
Notifications screen + unread integration.

### Security Requirements
Notifications user-scoped; no sensitive data in notification payloads.

### Testing
- [ ] Unit: dedupe logic; preference filtering
- [ ] Integration: signal change → notification row → WS event → marked read
- [ ] E2E: price alert fires at configured level and surfaces in-app
- [ ] Regression: previous tests pass

### Completion Criteria
All seven notification types produced, delivered in-app, user-manageable.

### Phase Output
The notification system.

### Next Phase
**PHASE 28 — Admin Dashboard & Audit**

---

## PHASE 28 — Admin Dashboard & Audit

### Objective
Implement the admin surface (ADMIN/ANALYST): system health, users, providers, model versions, prediction performance, data freshness, API usage, errors, audit logs — including provider disable.

### Why This Phase Exists
Operability is a professional-product requirement; drift/provider failures must be visible and actionable (README §20.2).

### Dependencies
```text
Depends on: PHASE 08 (provider health), PHASE 13/14 (model/performance), PHASE 03 (audit), PHASE 06 (roles)
```

### Tasks
- [ ] Admin API (guards: ADMIN for system, ANALYST for models): `/admin/health`, `/admin/users`, `/admin/providers` (+`PATCH :id` → disable → failover honors it via registry), `/admin/models`, `/admin/predictions/performance`, `/admin/audit-logs`, `/admin/usage` (rate-limit hits, latency percentiles), `/admin/errors` (SystemEvent query)
- [ ] Audit service completion: record `AUDIT_ACTION` flows where relevant (LOGIN/LOGOUT/REGISTER/SIGNAL_GENERATED/TRADE_OPEN/TRADE_CLOSE/ADMIN_ACTION/DATA_EXPORT/SETTINGS_CHANGE); admin query endpoint with filters
- [ ] Admin UI `/admin`: health cards (db/redis/api/ai/providers), users table (activation), providers table (health + disable toggle), models table (version, metrics, status incl. DRIFT_WARNING), prediction performance (accuracy/Brier/calibration/latest vs recent), data freshness dashboard, errors view, audit-log explorer
- [ ] Performance data pipeline: metric snapshots from SystemEvent + request logs for usage/errors panels

### Files/Folders
```text
apps/api/src/modules/admin/{admin.module.ts, controller, users.admin.ts, providers.admin.ts,
  models.admin.ts, perf.admin.ts, audit.admin.ts, usage.admin.ts}
apps/api/src/modules/audit/{audit.controller.ts, audit.query.ts}
apps/web/src/app/(dashboard)/admin/page.tsx · components/admin/*.tsx  (role-gated layout)
```

### Implementation
Read-mostly dashboards over existing tables; provider disable writes `ProviderStatus=DISABLED` honored by the P08 registry.

### Database Changes
Reads `ModelVersion`, `ModelRun`, `Prediction/PredictionOutcome`, `SystemEvent`, `AuditLog`, providers. No schema change.

### API Changes
```text
GET  /api/v1/admin/health | users | providers | models | predictions/performance
GET  /api/v1/admin/audit-logs | usage | errors
PATCH /api/v1/admin/providers/:id
```

### AI/ML Changes
None new (surfaces P13/P14 states).

### Frontend Changes
Admin page set (ADMIN/ANALYST gated).

### Security Requirements
Strict RBAC on every admin route (Integration-tested); audit-logs exclude sensitive payloads; provider disable audited.

### Testing
- [ ] RBAC matrix on all admin routes (USER 403, ANALYST limited, ADMIN full)
- [ ] Integration: disable provider → registry routes traffic to backup → re-enable
- [ ] Unit: audit query filters; DRIFT_WARNING renders from model status
- [ ] E2E (admin): view health → disable provider → provider list reflects
- [ ] Regression: previous tests pass

### Completion Criteria
Full operational visibility; provider failover control; auditable admin actions.

### Phase Output
The administration layer.

### Next Phase
**PHASE 29 — Full System Integration**

---

## PHASE 29 — Full System Integration

### Objective
Run the complete user journey end-to-end against the integrated stack, fix cross-service defects, and prove every README §8.2 endpoint functions with real data.

### Why This Phase Exists
Phases built modules in isolation; integration is where contract mismatches, timing bugs and cross-cutting failures surface. This is the last chance to fix them cheaply.

### Dependencies
```text
Depends on: ALL feature phases (P08–P28)
```

### Tasks
- [ ] **Full-stack journey pass** (with mock providers + seeded history): Register → configure risk profile → dashboard → pair page → charts/indicators → news → historical → AI assessment → risk review → accept signal as paper trade → track outcome → weekly report → regenerate
- [ ] Verify every README §8.2 route returns real data (not stubs) or a documented honest code
- [ ] Cross-service contract sweep: web↔api↔ai-engine field parity across all DTOs (automated parity suite already exists — run in CI mode)
- [ ] WS end-to-end: all seven event types emitted, delivered, applied to UI state
- [ ] Job orchestration: market-sync → features → predictions → signals → outcomes sequential dependency verified; backfill + integrity jobs run
- [ ] Redis invalidation: model/assessment/news caches invalidate correctly on data updates
- [ ] Seed refresh: reset DB → seed → full journey still green (fresh-install proof)
- [ ] Timezone/edge data: JPY pairs, 4H bars, DST boundary fixture all render correctly
- [ ] Document integration findings → fixes must come with regression tests

### Files/Folders
```text
tests/e2e/{journey.spec.ts, ws.spec.ts, admin-flow.spec.ts, mobile.spec.ts}
tests/journey-checklist.md
apps/api/src/** (fixes)
apps/web/src/** (fixes)
```

### Implementation
Integration test harness = real services + test DB + Redis + mock providers; full journeys in Playwright.

### Database Changes
Only if a documented defect requires a new migration (never edited migrations).

### API Changes
Bug-fix level only.

### AI/ML Changes
Bug-fix level only.

### Frontend Changes
Bug-fix level only.

### Security Requirements
Re-verify auth on every newly-realized route (each route has a guard spec).

### Testing
- [ ] All README §72 user-journey steps pass end-to-end
- [ ] WS contract tests (emit → deliver → UI applied)
- [ ] Fresh-install proof (reset→seed→journey) green
- [ ] Regression: entire P02–P28 suite passes

### Completion Criteria
Every documented journey works on the integrated system; no known contract mismatches remain.

### Phase Output
A fully connected, working application.

### Next Phase
**PHASE 30 — Testing**

---

## PHASE 30 — Testing

### Objective
Complete the test suite to the README §21 standard: fill coverage gaps, add missing integration/E2E/ML/security tests, enforce coverage thresholds for business-critical modules, and make all suites CI-ready.

### Why This Phase Exists
Feature phases tested their own slices; the committed suite must now be comprehensive, fast and blocking — it becomes the CI gate in P35.

### Dependencies
```text
Depends on: PHASE 29
```

### Tasks
- [ ] **Coverage audit** per module; enforce thresholds for business-critical dirs (risk, scoring, sizing, features, decision, MTM) — e.g. ≥85% line coverage, fail otherwise
- [ ] Fill unit gaps: every rule (P15), every score provider (P16), every backtest metric (P24), every indicator reference test (P10)
- [ ] Integration suites complete: DB, all provider adapters (fixtures), Redis (cache/limits/queues), AI-service contract, notification pipelines
- [ ] ML suite (pytest) complete & green: leakage, no-shuffle folds, reproducibility, calibration, feature correctness
- [ ] E2E suites complete: login, dashboard, market analysis, scanner, backtesting, paper trading, admin
- [ ] **Security test harness** (shared with P31): authn/authz matrix, rate limits, CORS, input validation fuzz-lite, XSS/CSP assertions
- [ ] `npm test` / `npm run test:integration` / `npm run test:e2e` / `npm run test:ml` all green in one command ordering
- [ ] CI-ready: suites run headless, deterministic seeds, no flaky timeouts (retry policy documented)

### Files/Folders
```text
tests/{unit,integration,e2e}/** (completed)
apps/ai-engine/tests/** (completed)
.jest-runner.json · playground.config.ts (CI profile)
scripts/run-all-tests.sh
```

### Implementation
Standardize on one runner config; make failure output actionable (requestId correlation).

### Database Changes
Test fixtures only (test DB `tradesense_test`).

### API Changes
None.

### AI/ML Changes
None.

### Frontend Changes
None.

### Security Requirements
Security tests assert the controls (see P31) — duplicate-aware, not just happy-path.

### Testing
This phase is itself the testing deliverable — its acceptance is the green suite.

### Completion Criteria
All suites green with enforced coverage; reproducibility across runs; CI-ready formatting.

### Phase Output
A comprehensive, trustworthy test suite.

### Next Phase
**PHASE 31 — Security Hardening**

---

## PHASE 31 — Security Hardening

### Objective
Execute the README §19/§80 security program: penetration-style review of auth, authorization, injection surfaces, secrets, headers, dependency audit, and AI security — fixing everything found.

### Why This Phase Exists
Security must be verified, not assumed; a single exposed secret or authorization bypass invalidates the project.

### Dependencies
```text
Depends on: PHASE 30
```

### Tasks
- [ ] **AuthN review**: token lifecycle, rotation/reuse, blacklist, MFA scaffold integrity, password policy, reset flows
- [ ] **AuthZ review**: every admin/analyst route re-checked; per-row ownership (positions, backtests, watchlists, notifications); test IDs swapped across users → 404/403
- [ ] **Secrets sweep**: grep for keys/tokens/`DATABASE_URL` patterns; `.env*` in git history check (`git log -p` scan); confirm only `NEXT_PUBLIC_*` reach client
- [ ] **Dependency audit**: `npm audit` + `pip-audit`; fix or document accepted risk with ticket
- [ ] **Headers/CSP**: helmet config reviewed; CSP tightened for chart/CDN needs; HSTS in prod
- [ ] **Injection**: SQL (Prisma-only enforced), NoSQL, header, SSRF (provider URL allowlist), XSS (escaped rendering, CSP), CSRF (cookie flows: refresh/logout double-submit)
- [ ] **Rate limiting stress**: verify limits hold under burst (test)
- [ ] **Prompt injection + AI security** (README §19.3): nested injection fixtures across news/assistant/explain; grounding validator bypass attempts
- [ ] **Log sanitization**: redaction list verified across logger paths
- [ ] Debug/health endpoint audit: nothing informative leaked unauthenticated
- [ ] Produce `docs/security.md` findings log (what was tested, what was fixed)

### Files/Folders
```text
apps/api/src/** (fixes from findings)
apps/ai-engine/app/** (AI security fixes)
tests/security/** (permanent regression tests for every finding)
docs/security-audit.md (findings + fixes log)
```

### Implementation
Find → fix → regression-test each issue; no finding closed without a test.

### Database Changes
None (unless a finding requires it — then a new migration).

### API Changes
None beyond fixes.

### AI/ML Changes
AI security hardening (injection, grounding).

### Frontend Changes
CSP-related and XSS-related fixes.

### Security Requirements
This entire phase.

### Testing
Run the P30 security harness + new finding regression tests; full suite green.

### Completion Criteria
No open high/medium findings; permanent tests exist for fixed issues; audit log written.

### Phase Output
A hardened, audited system.

### Next Phase
**PHASE 32 — Performance Optimization**

---

## PHASE 32 — Performance Optimization

### Objective
Measure end-to-end latency and resource use; fix only bottlenecks proven by data (README §22), re-measuring after each change.

### Why This Phase Exists
Professional products must be fast; premature optimization wastes effort, but proven bottlenecks erode trust (stale charts, slow assessments).

### Dependencies
```text
Depends on: PHASE 29
```

### Tasks
- [ ] **Baseline measurement**: Lighthouse (web), API p95 latency per route group, DB `EXPLAIN` on top queries, AI inference p95, scanner end-to-end, chart render with 10k candles
- [ ] **DB**: verify composite indexes used; add missing indexes via new migrations if EXPLAIN proves it; consider materialized daily aggregates for historical analysis
- [ ] **Caching**: Redis TTL audit; fridge caching for indicator/feature reads; assessment cache (`analysis:{symbol}`); cache-invalidation correctness re-checked
- [ ] **AI service**: inference warm-start, batch feature loads, async persistence; model payload sizes trimmed if shown hot
- [ ] **API**: lean projections, cursor pagination everywhere long lists exist
- [ ] **Frontend**: code-split routes, bundle analysis, chart data downsampling beyond X bars, virtualized tables, `requestIdleCallback` for non-critical widgets
- [ ] **Workers**: job batching, idempotent partial progress
- [ ] Re-measure; commit a `docs/performance-baseline.md` table before/after

### Files/Folders
```text
docs/performance-baseline.md
apps/api/src/** (fixed queries)
apps/ai-engine/app/** (inference fixes)
apps/web/src/** (frontend perf fixes)
prisma/migrations/** (perf indexes, only if proven)
```

### Implementation
Evidence-driven only; revert any change that does not move a measured metric.

### Database Changes
Indexes only, if EXPLAIN-proven.

### API Changes
Response-shape improvements only (contract-safe).

### AI/ML Changes
Inference-time optimization only (identical outputs).

### Frontend Changes
Perf optimizations.

### Security Requirements
No perf change may bypass validation, rate limits or auth.

### Testing
Full suite green after each optimization batch; contract parity verified.

### Completion Criteria
Measured improvement on documented bottlenecks; no regression elsewhere.

### Phase Output
An evidence-backed performance baseline.

### Next Phase
**PHASE 33 — Observability**

---

## PHASE 33 — Observability

### Objective
Complete structured logging, health/readiness, metrics, error tracking, request correlation and provider/AI/model monitoring per README §20.

### Why This Phase Exists
Staging and production (P36–P37) are blind without this; drift/provider failures must alarm before users notice.

### Dependencies
```text
Depends on: PHASE 32
```

### Tasks
- [ ] **Structured logging (JSON)** with `requestId` on every log; log levels env-driven; redaction config verified
- [ ] **Health endpoints final**: liveness/readiness with per-dependency detail (`/health/ready` → db/redis/api/ai/provider each up|degraded|down); surfaced in admin health
- [ ] **Metrics**: API latency histograms, AI latency, provider latency, error rate, prediction generation, data freshness by pair — to a metric sink (Prometheus-compatible endpoint or dashboard records)
- [ ] **Error tracking**: Sentry-compatible `SENTRY_DSN` slot; internal error feed via `SystemEvent`
- [ ] **Provider monitoring**: last success/failure timestamps per provider (from registry health → admin)
- [ ] **AI/market model monitoring**: drift status refreshed by the daily evaluation job (P14) → admin + notification hooks
- [ ] **Job observability**: BullMQ job latency/retry/failure metrics
- [ ] **Anomaly basics**: stale-data and provider-failure alerts feed P27 notifications for admins

### Files/Folders
```text
apps/api/src/common/{logging/, metrics.service.ts, health.service.ts}
apps/ai-engine/app/{logging.py, metrics.py}
docs/observability.md (panels, alert thresholds)
```

### Implementation
Lightweight, dependency-light: logs structured + metrics endpoint + SystemEvent; no heavyweight agent required.

### Database Changes
Metrics snapshots optionally in `SystemEvent`/dedicated aggregated tables (new migration if needed).

### API Changes
Health/metrics endpoints finalized.

### AI/ML Changes
Metrics + health in the AI service.

### Frontend Changes
Health/status widgets read admin APIs (already built in P28).

### Security Requirements
Metrics must not leak paths/query params/secrets; health detail admin-gated.

### Testing
- [ ] Log JSON schema assertions; redaction active under forced secret-bearing error
- [ ] `/health/ready` reflects induced outages (kill Redis → ready=degraded)
- [ ] Metrics emitted on synthetic traffic
- [ ] Regression: full suite green

### Completion Criteria
Full operational visibility exists, tested against induced failures.

### Phase Output
An observable system.

### Next Phase
**PHASE 34 — Docker & Infrastructure**

---

## PHASE 34 — Docker & Infrastructure

### Objective
Create production-grade containerization: all Dockerfiles, full docker-compose stack, prod overlay, reverse-proxy config, and verify clean-install reproducibility.

### Why This Phase Exists
Deployment (P36–P37) depends on reproducible images; local dev relies on the same definitions, so host/container parity is maintained.

### Dependencies
```text
Depends on: PHASE 33
```

### Tasks
- [ ] **Dockerfiles** (`infrastructure/docker/`): `api` (multi-stage, non-root), `ai-engine` (Python slim, non-root), `web` (standalone output), each with healthcheck
- [ ] **docker-compose.yml full stack**: postgres, redis, api (replicas), ai-engine, web, worker; `depends_on: service_healthy`; named volumes; env from `.env`; service tokens (`AI_SERVICE_TOKEN`) for api↔ai internal auth
- [ ] **Prod overlay** (`infrastructure/deployment/docker-compose.prod.yml`): resource limits, restart policies, TLS env, no source mounts, automated migrations entrypoint
- [ ] Reverse-proxy config (nginx/Caddy): TLS termination, `/`→web, `/api`→api replicas, WebSocket upgrade headers, security headers
- [ ] **Clean-install proof**: `docker compose down -v && docker compose up --build` → healthchecks green → seed → smoke journey passes
- [ ] Secrets: `.env.production` never committed (ops-created); compose references existing env only

### Files/Folders
```text
infrastructure/docker/{api.Dockerfile, ai-engine.Dockerfile, web.Dockerfile}
infrastructure/deployment/docker-compose.prod.yml, nginx.conf|Caddyfile, entrypoints/
docker-compose.yml (full)
scripts/docker-smoke.sh
```

### Implementation
Images reproduce the P01–P33 verified environment exactly; nothing that works locally fails in the container.

### Database Changes
Migration entrypoint runs `prisma migrate deploy`.

### API Changes
Service-token auth for internal AI calls enforced at proxy/network layer.

### AI/ML Changes
Model artifacts mounted/read-only into AI container.

### Frontend Changes
Dockerized web build.

### Security Requirements
Non-root containers, read-only FS where possible, secret-file injection (no `ARG` secrets baked into images), healthcheck-gated ordering.

### Testing
- [ ] Clean-install smoke from scratch (down -v → up → seed → journey)
- [ ] Image scan (Trivy) on built images; fix findings
- [ ] Regression: suite green on host CI profile
- [ ] WS through reverse proxy verified

### Completion Criteria
Full stack containers green from clean state; images scanned; prod overlay ready.

### Phase Output
Reproducible infrastructure.

### Next Phase
**PHASE 35 — CI/CD**

---

## PHASE 35 — CI/CD

### Objective
Deliver GitHub Actions pipelines matching README §26.1; production deployment requires full validation.

### Why This Phase Exists
Every future change must run the complete quality gate automatically; deployment must be gated, not manual.

### Dependencies
```text
Depends on: PHASE 30, PHASE 34
```

### Tasks
- [ ] `ci.yml`: install → lint → typecheck → unit → integration (services: postgres+redis) → python lint+ML tests → build (web/api/ai) → security audit (`npm audit`, `pip-audit`) → secret scan → Docker build (cache optimized)
- [ ] `deploy.yml`: manual-approve staging deploy on `main`; production deploy gated by staging e2e pass (README §26.1: no deploy on failed checks)
- [ ] Artifacts: `docs/openapi.json`, model registry snapshot (for model CI tests), coverage reports, performance baseline drift check
- [ ] Branch protection rules documented (P00 strategy enforced in settings)
- [ ] Test-dataset parity: CI runs the same synthetic dataset as local (seeded, deterministic)

### Files/Folders
```text
.github/workflows/{ci.yml, deploy.yml, security-scan.yml}
scripts/ci/{lint.sh, test.sh, build.sh, audit.sh}
```

### Implementation
Reuse `npm run *` scripts from P00–P30; jobs cached (`npm`, pip, prisma generate); matrix for node/python versions pinned.

### Database Changes
None (test DB migrations in CI).

### API Changes
None.

### AI/ML Changes
ML tests included; registry snapshot reproducible.

### Frontend Changes
Build + bundle-summary artifact.

### Security Requirements
Secret scan on every PR; `npm audit`/`pip-audit` fail-scoring enforced (documented thresholds); no secrets in workflows (`secrets.*` references only).

### Testing
- [ ] Push to PR → full pipeline green
- [ ] Merge to `main` (gate) → Docker build → deploy staging
- [ ] Staging e2e gate blocks broken promote
- [ ] Martix: pipeline completes under < 20 min (cached)

### Completion Criteria
Green, fast, gated CI/CD with security scanning.

### Phase Output
Automated quality gates + deployment pipeline.

### Next Phase
**PHASE 36 — Staging Deployment**

---

## PHASE 36 — Staging Deployment

### Objective
Deploy the full stack to a staging environment identical to production (real providers or mock+keys, TLS) and verify every feature.

### Why This Phase Exists
Staging catches environment-only defects (TLS, CORS, WS through proxy, provider keys, container networking) before production.

### Dependencies
```text
Depends on: PHASE 35
```

### Tasks
- [ ] Provision staging host (or cloud VM) + DNS + TLS certs
- [ ] Deploy via `deploy.yml` staging job; run migrations entrypoint
- [ ] Configure real/mock providers + any available API keys; confirm `MARKET_DATA_PROVIDER` behavior
- [ ] Run full staging verification: auth, market, AI, news, charts, backtesting, paper trading, notifications, admin (README §43 checklist)
- [ ] Verify WS over proxy, CORS with real origin, rate limits, TLS headers
- [ ] Seed realistic history; run prediction/signal generation; verify drift monitoring active
- [ ] Instrument page-load metrics (P32 baseline comparison)
- [ ] Fix staging-specific issues → regression-test each fix

### Files/Folders
```text
infrastructure/deployment/staging.env.example
scripts/staging/verify-staging.sh
```

### Implementation
Config-only differences from production (no code changes for staging; any code change is a PR-fix).

### Database Changes
Migrations via deploy job.

### API Changes
None.

### AI/ML Changes
Model artifacts deployed with training stage.

### Frontend Changes
None.

### Security Requirements
TLS verified (HSTS), weak ciphers disabled, staging credentials distinct from prod, no prod secrets on staging.

### Testing
Full staging verification checklist executed and recorded.

### Completion Criteria
Staging green across all feature areas; environment issues all fixed with tests.

### Phase Output
A verified, production-like staging environment.

### Next Phase
**PHASE 37 — Production Deployment**

---

## PHASE 37 — Production Deployment

### Objective
Deploy to production with operational safeguards: environment config, TLS, backups, logging alerting, monitoring, and verified deploys.

### Why This Phase Exists
The final stage of the build; production must be configured deliberately (secrets, backups, monitoring) rather than by default.

### Dependencies
```text
Depends on: PHASE 36
```

### Tasks
- [ ] Provision production host + DNS + TLS + WAF/rate-limit notes
- [ ] Configure production env vars (all secrets from secret store, never repo), `NODE_ENV=production`, `REFRESH_COOKIE_SECURE=true`, `CORS_ORIGINS` = real origins, `LOG_LEVEL=info`
- [ ] Enable real-time providers (or documented market-provider key with failover) + LLM provider key; verify keyless fallbacks still function as safety net
- [ ] Run migrations; seed reference data (no demo user, or demo disabled in prod)
- [ ] **Backups**: nightly `pg_dump` with retention + restore-tested procedure documented
- [ ] **Logging/alerting**: structured logs shipped (SENTRY_DSN), admin + operator alerts for stale data/provider failure/model drift (P27/P33)
- [ ] Monitoring dashboards live (P33 metrics)
- [ ] Graceful deploy: rolling restart api/worker, web static release, AI service restart with model artifacts
- [ ] Post-deploy smoke + rollback drill (redeploy previous tag) documented

### Files/Folders
```text
infrastructure/deployment/production.env.example
infrastructure/deployment/backup.sh
docs/deployment.md (ops runbook: deploy, rollback, backup/restore, scale)
```

### Implementation
Operations-owned config surfaces: runbook + scripts; application code changes are PR-driven.

### Database Changes
Migration deploy; backup scheduled.

### API Changes
None.

### AI/ML Changes
Model registry deployed; calibration artifacts validated.

### Frontend Changes
None.

### Security Requirements
Secrets in secrets manager only; TLS enforced; backups encrypted; role-restricted access to production.

### Testing
- [ ] Post-deploy smoke (health, auth, quote, assessment, WS)
- [ ] Restore drill from backup completed once and documented
- [ ] Rollback drill completed and documented
- [ ] Alerts fired artificially → received (P33 hooks)

### Completion Criteria
Production stack live, monitored, backed up, with tested rollback/restore paths.

### Phase Output
A production system.

### Next Phase
**PHASE 38 — Final QA**

---

## PHASE 38 — Final QA (Acceptance Testing)

### Objective
Execute the complete acceptance checklist (README §29-adjacent + §45 of the roadmap prompt) against staging/production and record results.

### Why This Phase Exists
Final user-centric verification before completion; catches experience-level gaps code tests miss.

### Dependencies
```text
Depends on: PHASE 37
```

### Tasks
Run and record each checklist item:

```text
[ ] Registration    [ ] Login    [ ] Logout    [ ] Password reset
[ ] Dashboard       [ ] Market search            [ ] Current prices
[ ] Historical prices            [ ] Charts     [ ] Technical indicators
[ ] News            [ ] Sentiment               [ ] AI analysis
[ ] Prediction      [ ] Risk                    [ ] Scanner
[ ] Backtesting     [ ] Paper trading           [ ] Portfolio
[ ] Watchlist       [ ] Notifications           [ ] Admin
[ ] Audit logs      [ ] Error handling          [ ] Mobile
[ ] Accessibility   [ ] WS live updates         [ ] NO TRADE surfaces honestly
[ ] Model version on outputs        [ ] Data freshness indicators
```

Each item: pass/fail + note; failures fixed with regression tests before re-test.

### Files/Folders
```text
docs/qa-acceptance.md (results matrix)
```

### Implementation
Manual + automated double pass; screenshots preserved for evidence.

### Database Changes
None.

### API Changes
None (fixes go through PR).

### AI/ML Changes
None.

### Frontend Changes
Fix-only.

### Security Requirements
Edge: verify unauthenticated/other-user/no-role paths during each flow.

### Testing
The acceptance matrix is the deliverable.

### Completion Criteria
Checklist 100% pass; every failure resolved and retested.

### Phase Output
Signed-off acceptance matrix.

### Next Phase
**PHASE 39 — Final AI Validation**

---

## PHASE 39 — Final AI Validation

### Objective
Run the README §81 AI audit against the deployed system and record evidence for every item.

### Why This Phase Exists
The project's central promise is AI honesty; this audit is the formal proof.

### Dependencies
```text
Depends on: PHASE 38
```

### Tasks
Verify with evidence (tests + captures):

```text
[ ] Does not guarantee profit / 100% accuracy     — grep code + prompts + UI copy
[ ] Does not fabricate market data                — provider validation tests
[ ] Does not fabricate news                       — dedupe + source + injection tests
[ ] Does not invent indicators                    — grounding validator tests
[ ] Does not hide uncertainty                     — contradicting evidence always present
[ ] Can return NO TRADE                           — NO-TRADE matrix tests + live capture
[ ] Shows probability + confidence + risk         — output schema verified
[ ] Shows evidence + data freshness + model version — signal/AIAnalysis schema verified
[ ] Uses historical validation                    — walk-forward artifacts present
[ ] Avoids future-data leakage                    — leakage test suite green in CI
[ ] Calibration honest                            — calibration curves + Brier in registry
[ ] Drift detected loudly                         — drift fixture test + admin panel
```

### Files/Folders
```text
docs/ai-audit.md (evidence log tying each item to test names + captures)
```

### Implementation
Each item → specific test file/capture as evidence; no item closed on assertion alone.

### Database Changes
None.

### API Changes
None.

### AI/ML Changes
None.

### Frontend Changes
None.

### Security Requirements
Includes prompt-injection audit evidence (nested fixtures passing in CI).

### Testing
Run the cited test suites and attach results.

### Completion Criteria
All items pass with evidence; any failure fixed and re-audited.

### Phase Output
Formal AI-integrity audit pass.

### Next Phase
**PHASE 40 — Documentation Verification**

---

## PHASE 40 — Documentation Verification

### Objective
Update the README/project documentation with implementation evidence only — do not rewrite the design — and verify every documented command/endpoint still holds.

### Why This Phase Exists
Documentation that drifted from reality is worse than none; the README describes intended behavior, this phase confirms it matches, and records what changed.

### Dependencies
```text
Depends on: PHASE 39
```

### Tasks
- [ ] Verify README §8 endpoint table matches the running OpenAPI export (diff `docs/openapi.json` → README)
- [ ] Verify env variable list matches `.env.example`; adjust BOTH if a documented gap exists
- [ ] Verify setup/local-dev/run/testing commands in README work from a clean checkout (fresh machine pass)
- [ ] Verify Docker/CI/deployment sections match repo reality (P34–P37)
- [ ] Add implementation evidence: how to run each test suite, known limitations (mock providers, spot-forex volume caveat, backtest assumptions), operational runbooks
- [ ] Confirm expected deliverables list (README §33) — full academic report at `docs/research/PROJECT-REPORT.md` if required (write from §32 + QA evidence)
- [ ] No original design statements altered; mark implementation-status notes explicitly

### Files/Folders
```text
README.md (implementation-status annotations only)
docs/ (openapi export refresh, research report if required, operations runbooks)
```

### Implementation
Diff-based verification; every README claim spot-checked by a running command.

### Database Changes
None.

### API Changes
None.

### AI/ML Changes
None.

### Frontend Changes
None.

### Security Requirements
README security section reflects the deployed reality (no over-claims).

### Testing
Fresh-checkout execution of the documented quick-start (P00–P01 scripts) — the ultimate doc test.

### Completion Criteria
Documentation is accurate, complete and verified against a clean run.

### Phase Output
Verifiably correct documentation.

### Next Phase
**PHASE 41 — Final Project Audit & Completion**

---

## PHASE 41 — Final Project Audit & Completion

### Objective
Final repository-wide audit (README §80/§83/§84 + §48 of this roadmap), resolve every outstanding issue, and declare project completion.

### Why This Phase Exists
Completeness is only real when verified: no leftover scaffolding, secrets, debug code or unfinished surfaces may ship.

### Dependencies
```text
Depends on: PHASE 38, PHASE 39, PHASE 40
```

### Tasks
- [ ] Search-and-resolve sweep: `TODO`, `FIXME`, `placeholder`, `Coming soon`, `console.log`, `debugger`, unused imports/deps, dead code, mock-data leakage into production paths, temporary components
- [ ] Repository scan for secrets in code + git history (force-refresh history if found — requires documented decision)
- [ ] README §79 quality gate: walk every item and record evidence
- [ ] Audit final structure vs §3 skeleton (nothing orphaned)
- [ ] Confirm tests, typecheck, lint, Python tests all green on clean checkout; production build + Docker smoke pass
- [ ] Confirm COUNTS: full suite + coverage report archived; performance baseline documented (P32)
- [ ] Write completion report: what was built, phase list with status, acceptance evidence, known limitations, next steps (future extensibility)
- [ ] Tag release `v1.0.0` (semver) after sign-off

### Files/Folders
```text
docs/completion-report.md (final report)
docs/quality-gate.md (per-item evidence)
.gitignore/scripts cleanup as needed
```

### Implementation
Strict sweep; anything questionable resolved or justified in the report.

### Database Changes
None.

### API Changes
None.

### AI/ML Changes
None.

### Frontend Changes
Cleanup only.

### Security Requirements
Final secrets scan + dependency scan green.

### Testing
Full suite + fresh-checkout build + docker smoke = the audit evidence.

### Completion Criteria
Quality gate 100% with evidence; no TODO/FIXME/secrets/dead code; release tagged; report accepted.

### Phase Output
**TradeSense AI v1.0.0 — complete, tested, hardened, deployed, documented.**

### Next Phase
**None — PROJECT COMPLETE.** Future work goes through the normal PR/CI loop (P35) using the README's extensibility interfaces.

---

## 5. Parallel Work Plan (consolidated)

| Slot | Work | Start condition | Merge point |
|---|---|---|---|
| A (Track A) | P08→P09→P10→P11→P12→P13→P14→P15→P16→P17 | P07 done | P29 |
| B (Track B) | P18→P19 | P06+P07 done (contracts), P08/P16 endpoints for dashboard | P29 |
| C | P20 (charts/analysis) | P09+P10+P17 done | P29 |
| D | P21–P23 | P16 / P11 / P15 + P18 done | P29 |
| E (Track C) | P24–P28 backend first, then UI | P15+P16+P18 done | P29 |
| Serial | P29–P41 | strict order | — |

Rules: two engineers may hold B/C/D and A simultaneously; never two phases writing the **same module** at once. Any merge conflict window is scheduled into P29.

---

## 6. Blockers & External Dependencies

| Dependency | Needed by | Without it | Temporary alternative | To resume |
|---|---|---|---|---|
| No API key (`MARKET_API_KEY`) | P08 real providers | AlphaVantage/TwelveData unavailable | `MockProvider` (fully functional) | Set key → run provider tests |
| No `NEWS_API_KEY` | P11 | Production news adapter offline | `MockProvider` news fixtures | Set key → integration tests |
| No `AI_API_KEY` | P17 | Real-LLM explanations/assistant unavailable | `MockLLM` template explanations (grounded, validated) | Set key → LLM tests + upgrade |
| No email/SMTP | P06 | Real verification/reset emails | Dev-mode console/token links (documented) | Wire SMTP env |
| No staging/prod hosts | P36/P37 | Deploy blocked | Local full-stack Docker (P34) | Provision + run deploy |
| Unavailable provider (outage) | P08+ | Auth data suppliers down | Failover provider + `MARKET_DATA_UNAVAILABLE` | Provider recovers |
| Unsupported dependency version | any | build/lint fail | Pin known-good versions (P00/P02) | Upgrade via PR |

**Blocker policy:** a phase missing a dependency is marked **BLOCKED**, not complete — with the temporary alternative used and documented (§: resolver side).

---

## 7. Master Implementation Tracker

| Phase | Name | Status | Dependencies | Deliverable |
|---|---|---|---|---|
| 00 | Project Initialization | COMPLETED | None | Initialized repo + conventions |
| 01 | Development Environment | COMPLETED | 00 | Working toolchain + data tier |
| 02 | Monorepo Foundation | COMPLETED | 01 | Buildable monorepo skeleton |
| 03 | Architecture Foundation | COMPLETED | 02 | Cross-cutting API/AI/WS/queue skeleton |
| 04 | Database Foundation | COMPLETED | 03 | Complete schema + migrations + seed |
| 05 | Shared Types & Validation | COMPLETED | 04 | Enforced API contracts |
| 06 | Authentication & Authorization | COMPLETED | 04,05 | Full auth lifecycle + RBAC |
| 07 | Backend Core | COMPLETED | 06 | Complete API surface (honest stubs) |
| 08 | Market Data Infrastructure | NOT STARTED | 07 | Live quotes w/ failover + caching |
| 09 | Historical Data Pipeline | NOT STARTED | 08 | Full validated history + fast API |
| 10 | Technical Analysis Engine | NOT STARTED | 09 | Proven indicators + patterns + regime |
| 11 | News Intelligence | NOT STARTED | 08,07 | Structured news + economic events |
| 12 | Feature Engineering | NOT STARTED | 10,11 | Versioned leakage-free features |
| 13 | Machine Learning Pipeline | NOT STARTED | 12 | Calibrated versioned models |
| 14 | Prediction Engine | NOT STARTED | 13 | Recorded predictions + outcomes + drift |
| 15 | Risk Management Engine | NOT STARTED | 07,06,09 | Tested sizing + rule engine |
| 16 | Decision Engine | NOT STARTED | 10,11,14,15 | Signals, NO-TRADE, scanner |
| 17 | AI Explanation Engine | NOT STARTED | 16,11 | Validated explanations/reports/assistant |
| 18 | Frontend Foundation | NOT STARTED | 06,07 | Design system + shell + clients |
| 19 | Dashboard | NOT STARTED | 18,16,08 | Real-data dashboard |
| 20 | Market Analysis UI | NOT STARTED | 18,10,17,09 | Analysis page + charts + scenarios |
| 21 | Market Scanner | NOT STARTED | 18,16 | Scanner screen |
| 22 | News Interface | NOT STARTED | 18,11 | News + calendar screens |
| 23 | Risk Interface | NOT STARTED | 18,15 | Risk screens + calculator |
| 24 | Backtesting | NOT STARTED | 16,15,09 | No-lookahead backtest engine + UI |
| 25 | Paper Trading | NOT STARTED | 15,16,08 | Simulated trading + accounting |
| 26 | Portfolio & Watchlist | NOT STARTED | 25,16,18 | Portfolio risk + watchlist |
| 27 | Notifications | NOT STARTED | 11,16,26 | 7-type notification delivery |
| 28 | Admin & Audit | NOT STARTED | 08,13/14,03,06 | Admin surface + provider control |
| 29 | Full System Integration | NOT STARTED | 08–28 | End-to-end working system |
| 30 | Testing | NOT STARTED | 29 | Comprehensive green test suite |
| 31 | Security Hardening | NOT STARTED | 30 | Hardened + audited system |
| 32 | Performance Optimization | NOT STARTED | 29 | Measured performance baseline |
| 33 | Observability | NOT STARTED | 32 | Monitoring + alerts + health |
| 34 | Docker & Infrastructure | NOT STARTED | 33 | Reproducible container images |
| 35 | CI/CD | NOT STARTED | 30,34 | Gated automated pipelines |
| 36 | Staging Deployment | NOT STARTED | 35 | Verified staging environment |
| 37 | Production Deployment | NOT STARTED | 36 | Live production stack |
| 38 | Final QA | NOT STARTED | 37 | Signed acceptance matrix |
| 39 | Final AI Validation | NOT STARTED | 38 | AI-integrity audit pass |
| 40 | Documentation Verification | NOT STARTED | 39 | Verified accurate docs |
| 41 | Final Audit & Completion | NOT STARTED | 38,39,40 | Release v1.0.0 + report |

**Statuses:** `NOT STARTED` · `IN PROGRESS` · `BLOCKED` · `TESTING` · `COMPLETED`

---

## 8. Final Completion Checklist (recorded in P41)

```text
[ ] All 42 phases COMPLETED (no BLOCKED carriers)
[ ] README §79 quality gate: 30/30 with evidence
[ ] SECURITY: no secrets in code/history · dependency scans green · RBAC verified
[ ] AI: §81 audit 15/15 with evidence (see P39)
[ ] PERFORMANCE: baseline documented, hot paths measured
[ ] TESTING: unit+integration+E2E+ML suites green from clean checkout
[ ] DEPLOYMENT: staging verified, production live, backups+rollback tested
[ ] DOCS: README accurate, openapi exported, completion report written
[ ] CODE: no TODO/FIXME/debug/mock leakage/stray files
[ ] RELEASE: v1.0.0 tagged
```

---

## 9. Execution Rule (this roadmap in practice)

1. Say **"Start Phase XX"**.
2. The phase's Objective/Why/Dependencies/Tasks are read from this file.
3. Repository is inspected, the phase implemented, **tested**, fixed, verified against Completion Criteria.
4. Previous-phase tests are re-run (never break prior work).
5. A short report is delivered: what was completed, evidence, blockers (if any → BLOCKED state), what remains, and the next phase.
6. Wait for the next instruction. **Do not auto-run multiple phases.**



