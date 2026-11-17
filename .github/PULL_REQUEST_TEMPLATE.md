## Summary

<!-- What changed and why. Reference the phase from IMPLEMENTATION-ROADMAP.md (e.g. P04). -->

## Phase / scope

- [ ] Phase: `PXX — Phase name`
- [ ] Branch: `feature/PXX-short-name` off protected `main`; merge via PR
- [ ] Commit messages follow Conventional Commits (enforced by commitlint)
- [ ] Only files required by this phase were changed
- [ ] No prior phase was broken (all earlier tests still pass)

## Engineering conventions

- [ ] SOLID / DRY / KISS applied; no speculative abstractions
- [ ] Strong typing — no `any` in public contracts, strict TypeScript
- [ ] Comments explain **why** (financial logic, math, security, non-obvious architecture) — not what
- [ ] No `TODO`, `placeholder`, `Coming soon`, or mock UI
- [ ] No secrets, credentials, or `.env` variants added to git

## Verification

- [ ] `npm run lint`
- [ ] `npm run typecheck` (when available)
- [ ] `npm test` (new + all prior tests)
- [ ] `npx ruff check apps/ai-engine` (when Python code is added)
- [ ] Environment verification (`scripts/verify-env.sh`) passes

## Financial-safety checklist (for analysis, risk, signal or trading changes)

- [ ] Outputs remain probabilities/confidence/evidence — never guarantees
- [ ] NO-TRADE path preserved where evidence is insufficient
- [ ] No real-money execution path introduced
- [ ] No fabricated or stale market data can be presented as current

## Notes for reviewers

<!-- Blockers, design decisions, deviations from README/roadmap, or follow-up phases. -->
