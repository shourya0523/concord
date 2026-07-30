# Execution plan

## Phase 0 (this branch) — DONE when committed

- [x] Confirm §0 baseline (bank 3492; BFF + parallel + corpus on main)
- [x] Refresh `sibling-agents.md` (PRs #2/#5/#7 merged)
- [x] Read slash skills → `skills-used.md` (`/create-subagent` missing; agents exist)
- [x] Ownership / dependency / integration / status docs
- [x] Minimum `packages/contracts` freeze
- [x] Scaffold owned package dirs
- [x] Push + PR; spawn Wave 1 Tasks

## Wave 1 (parallel Tasks — one message)

| Agent | Branch | Exit criteria (Wave 1) |
|-------|--------|------------------------|
| `ibpe-architecture` | `local/ws-architecture-a9ff` | Contracts expanded; monorepo stubs; ADR; audit delta vs §0; status file |
| `ibpe-design-system` | `local/ws-design-system-a9ff` | `packages/ui` shadcn init + Editorial Finance Terminal tokens; heatmap/citation/chip primitives stubs |
| `ibpe-database` | `local/ws-database-a9ff` | `packages/database` + migration path from bank + corpus SQL; seed design |
| `ibpe-glassdoor` | `local/ws-glassdoor-a9ff` | Parallel runner BFF parity design/impl start; PE targets; signal-only docs |
| `ibpe-data-quality` | `local/ws-data-quality-a9ff` | GitHub import path wired to contracts; license note; quality reports updated |
| `ibpe-answers` | `local/ws-answers-a9ff` | Gemini enrich job skeleton + validators; provenance labels |
| `ibpe-infra` | `local/ws-infra-a9ff` | CI green for monorepo stubs; vercel.json scaffold; env inventory |

## Wave 2 (after foundation gate) — DONE on main

- [x] `ibpe-frontend` — company rooms + concept labs (#19)
- [x] `ibpe-backend` — APIs + Neon Auth (#20)
- [x] `ibpe-search` — hybrid search + pseudo-RAG retrieval (#21)
- [x] Integrate Wave 2 PR (#22)

## Wave 3 — IN PROGRESS

- [ ] `ibpe-qa` — `/verification` critical paths; product + release gates; reports
- [ ] `ibpe-infra` — preview → prod smoke; monitoring/backups; worker health docs
- [ ] Orchestrator integrate + update status

## Integration cadence

After Wave 1 returns: merge architecture → database → design-system → infra first; rebase data/answers/glassdoor; open integration PR to main; then Wave 2.

After Wave 2 on main: spawn Wave 3 QA + infra in parallel; merge infra docs carefully with QA reports; do not block on Glassdoor credentials.
