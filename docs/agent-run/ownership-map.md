# Ownership map

Law for parallel streams. Cross-editing owned paths is a merge failure.

## Hot-path single owners

| Path | Owner | Notes |
|------|-------|-------|
| `packages/contracts/**` | `ibpe-architecture` | Zod + JSON Schema; Python mirrors via codegen or hand-sync to Pydantic |
| `packages/config/**` | `ibpe-architecture` | Shared env/feature flags |
| `packages/domain/**` | `ibpe-architecture` | Pure domain helpers (optional Wave 1 stub) |
| `packages/ui/**` | `ibpe-design-system` | shadcn + Editorial Finance Terminal |
| `packages/database/**` | `ibpe-database` | Schema, migrations sole owner |
| `migrations/**` | `ibpe-database` | Coordinate with existing `migrations/001_init.sql` |
| `scrapers/bank.py`, `batch.py`, `bff_api.py`, `scraper.py`, `auth.py`, `session_state.py`, `driver.py`, `target_helpers.py` | `ibpe-glassdoor` | Firm signals only |
| `scripts/parallel_batch.py`, `scripts/guided_login.py` | `ibpe-glassdoor` | |
| `config/targets.json` | `ibpe-glassdoor` | PE expansion OK |
| `data/question_bank.json` | `ibpe-glassdoor` (writes) / `ibpe-data-quality` (import-only reads) | |
| `fixtures/glassdoor/**` | `ibpe-glassdoor` | |
| `src/ibpe_corpus/adapters/github/**`, `adapters/static/**`, `config/github_sources.yml` | `ibpe-data-quality` | Teaching truth import |
| `src/ibpe_corpus/canonical/**`, `orchestration/**`, `export/**`, `pe/**` (classify/coverage) | `ibpe-data-quality` | Transform/dedupe/publish |
| `src/ibpe_corpus/answers/**`, Gemini enrich jobs | `ibpe-answers` | |
| `src/ibpe_corpus/adapters/glassdoor/**` | Shared: glassdoor owns fetch; data-quality owns bank import bridge | Prefer PRs that don't thrash both |
| `exports/**`, `reports/*quality*`, `reports/pe-*` | `ibpe-data-quality` | |
| `reports/answer-*` | `ibpe-answers` | |
| `apps/web/**` feature routes | `ibpe-frontend` | Wave 2 |
| `apps/web` DS demo route only | `ibpe-design-system` | Coordinate path |
| `apps/worker/**` | `ibpe-infra` scaffold + glassdoor/answers job code by owner | |
| API/auth under `apps/web` server modules | `ibpe-backend` | Wave 2 |
| `packages/search/**`, `packages/ai/**` | `ibpe-search` / `ibpe-answers` | Wave 2 / 1 |
| `.github/workflows/**`, `vercel.json` | `ibpe-infra` | |
| `docs/agent-run/status/<stream>.md` | That stream only | Reduce conflicts |
| `docs/agent-run/{ownership,dependency,execution,integration,status,skills,sibling}*.md` | `ibpe-orchestrator` | |
| `docs/architecture.md`, `docs/decisions/**`, `docs/research/repository-audit.md` | `ibpe-architecture` | |
| `main.py`, `web/` Flask | Preserve; glassdoor/orchestrator only for CLI shims | Do not break |
| `.env.example` | architecture + infra (coordinate) | No real secrets |

## Status files (per stream)

```text
docs/agent-run/status/architecture.md
docs/agent-run/status/design-system.md
docs/agent-run/status/database.md
docs/agent-run/status/glassdoor.md
docs/agent-run/status/data-quality.md
docs/agent-run/status/answers.md
docs/agent-run/status/infra.md
docs/agent-run/status/frontend.md    # Wave 2
docs/agent-run/status/backend.md     # Wave 2
docs/agent-run/status/search.md      # Wave 2
docs/agent-run/status/qa.md          # Wave 3
```
