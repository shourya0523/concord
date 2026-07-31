# Status: architecture

State: wave1-contract-gap-complete
Wave: 1
Branch: `local/backend-gaps-contracts-1fb3`
Updated: 2026-07-31

## Exit criteria

| Criterion | Status |
|-----------|--------|
| Confirm §0 baseline (bank ~3492; corpus + BFF + parallel on main) | done — see `docs/research/repository-audit.md` |
| Expand Zod contracts | done — `@ibpe/contracts` v0.1 |
| Close DESIGN §10 backend contract gaps | done — modules, layered study, simulator, saved items |
| Monorepo stubs solid | done — root workspace, apps/*, packages/{contracts,config,domain} |
| Architecture + ADRs | done — `docs/architecture.md` + ADRs 0002–0005 |
| Preserve `python main.py` | done — ADR 0004; no CLI edits |
| Status file updated | done |

## Delivered

- `packages/contracts` — Answer, Occurrence, Firm, Role, Attempt, Mastery, SearchRequest/Response, JobEvent, ApiError, taxonomy, CompletedJob/bank
- `packages/contracts` product gap addendum — LearningModule/Checkpoint/Lesson/Progress, QuestionStudyPayload/AnswerLayers, TargetCompanySet Get/Put helpers, simulator metadata session helper, StudyPlan module checkpoint items, Bookmark/Collection/CollectionItem
- `packages/config` — env Zod + feature flags
- `packages/domain` — track/domain helpers
- `package.json` + `pnpm-workspace.yaml` + `tsconfig.base.json`
- `.env.example` product placeholders (no secrets)
- Docs: audit, architecture, ADRs 0002–0005

## Blockers

None for Wave 1 architecture exit.

**Process note:** Parallel agents shared `/workspace` and switched branches mid-run; architecture deliverables were recovered from stash into an isolated worktree (`/tmp/ws-architecture-a9ff-wt`) and committed only on `local/ws-architecture-a9ff`.

## Notes / handoffs

- Database stream: consume contracts for Neon/Drizzle mapping.
- Answers stream: use `AnswerProvenanceEnum` exactly; no `source_provided` for Gemini drafts.
- Glassdoor stream: bank → occurrence only; optional `backend` on `CompletedJob`.
- Infra: wire CI typecheck for `@ibpe/contracts` / `@ibpe/config`; vercel.json owned by infra.
- Frontend/backend: wait Wave 2; apps/web is stub only.
- Backend/frontend gap streams: consume `QuestionStudyPayloadSchema` for layered reveal, `SimulatorPracticeSessionSchema` for `mode=simulator`, and `LearningModuleSchema`/`ModuleProgressSchema` for Learn roadmap APIs. Teaching answer provenance continues to exclude `glassdoor_occurrence`.
