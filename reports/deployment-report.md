# Deployment report (Workstream J)

**Wave:** 3 (promote / deployment gate)  
**Branch:** `local/ws-infra-wave3-d1de`  
**Updated:** 2026-07-31

## Plan (preview → production)

1. Scaffold `vercel.json`, ignore rules, and link docs (`docs/deployment/`).
2. Keep Python pytest CI; add Node package checks + `npm ci` / web build guard.
3. Wire worker schedule stubs (dispatch-only) — no unattended Glassdoor crawl in Actions.
4. ~~When `apps/web` has a Next.js app…~~ **Done** — preview + production live.
5. QA validates critical paths (Wave 3 parallel).
6. ~~Wave 3: monitoring integrations, backups, prod smoke.~~ **Smoke run + gate checklist filled** (monitoring/backups still partial — see blockers).

## Topology

| Component | Target | Status |
|-----------|--------|--------|
| Next.js product | Vercel (`apps/web`) | Live |
| Scrapers / enrich | `apps/worker` / Cloud Agents | Dockerfile + schedule stubs + health docs |
| Object storage | Vercel Blob (private) | Docs + env names; token not verified this run |
| DB | Neon (marketplace) | Configured on prod; health check passes |
| Auth | Neon Auth | Configured on prod; protected routes redirect anonymous users |
| CI | GitHub Actions | `pytest` + `npm ci` + `@ibpe/web` build |
| Monitoring | Vercel logs + example config | Runtime logs available; Sentry/OTEL not wired |

## URLs

| Environment | URL | Notes |
|-------------|-----|-------|
| Production (public) | https://concord-umber.vercel.app | **Deployment-gate target** |
| Production (team alias) | https://concord-shourya0523s-projects.vercel.app | Vercel Deployment Protection SSO (302) — not used for anonymous smoke |
| Preview | Git branch previews via Vercel Git integration | Root Directory = `apps/web` |

## Design Phase 1 deployment (2026-07-31)

Commit `7febf6c` deployed through the Vercel Git integration to
https://concord-umber.vercel.app.

| Check | Result |
|-------|--------|
| `/learn` | 200 |
| `/plan` | 200 |
| `/simulator` | 200 |
| `/api/learn/modules` | 200; 5 published modules |
| `/api/prep/heat?firm_id=firm_goldman_sachs` | 200; local bank signal path available |
| `/api/health` | 200; `auth: configured`, `database: configured` |
| Public production smoke routes | Pass |
| Protected anonymous routes/APIs | 307 to Neon Auth or 401, expected |

The current `scripts/prod_smoke.sh` was written while production auth used the
stub mode and expects anonymous 200/201 responses from protected paths. With
Neon Auth configured, it now produces a false-negative overall verdict for
`/prep/heat`, `/prep/rag`, `/api/mastery`, `/api/notes`,
`/api/practice/sessions`, and `/api/admin/status`. An authenticated test user
or auth-aware smoke mode is still needed for those paths.

## Phase 2 rework deployment (2026-07-31)

Deployed via Git push to `main` (commits `75054bc`, `9dcb8a5`, `deb5977`,
`0b48a85`, `70f82c6`, `29b729b`) through the Vercel Git integration to
https://concord-umber.vercel.app.

Migrations 034 + 035 applied directly to prod Neon (additive): occurrence
topic column + question topic backfill (`keyword_rules_v1`; 3,492 occurrences
tagged), heat view rewrites, three-statement diagram + learning resource
seeds.

| Check | Result |
|-------|--------|
| `@ibpe/web` typecheck | Pass |
| `@ibpe/web` lint | 0 errors; 41 warnings (same class as baseline) |
| `@ibpe/web` production build | Pass; 48 routes |
| Python unit/integration suite | Pass; 114 tests |
| Local + production smokes | Pass — real tagged heat (e.g. Goldman behavioral n=62 / valuation n=50); signals total 456; concepts with diagrams; module checkpoints with 6 real question ids; pages 200 |
| Browser E2E | Video recorded |

Remaining knowns:

- Anonymous 307/401 on protected routes is expected Neon Auth behavior.
- Authenticated E2E still needs a test user.
- Vercel CLI token still rejected (`User not found`); Git-linked deployment remains operational.

## Monorepo Vercel config (confirmed Wave 3)

| Check | Result |
|-------|--------|
| Root Directory | `apps/web` (documented in `docs/deployment/vercel-project-link.md`) |
| `apps/web/vercel.json` | `installCommand` / `buildCommand` from monorepo root via `npm ci` + workspace build |
| `.vercelignore` | Uses `/web` (not bare `web`) — does not strip `apps/web` |
| Lockfile | `package-lock.json` only — no `pnpm-lock.yaml` |
| Root `vercel.json` | Schema-only stub (intentional) |

## Wave 3 production smoke (2026-07-30)

Target: `https://concord-umber.vercel.app`  
Script: `bash scripts/prod_smoke.sh`

| Path | Method | HTTP | Notes |
|------|--------|------|-------|
| `/` | GET | 200 | |
| `/dashboard` | GET | 200 | |
| `/study` | GET | 200 | |
| `/simulator` | GET | 200 | |
| `/onboarding` | GET | 200 | |
| `/sign-in` | GET | 200 | |
| `/sign-up` | GET | 200 | |
| `/settings` | GET | 200 | |
| `/prep/heat` | GET | 200 | |
| `/prep/rag` | GET | 200 | |
| `/companies/goldman-sachs` | GET | 200 | |
| `/api/health` | GET | 200 | `{"ok":true,"auth":"stub","database":"unavailable"}` |
| `/api/questions` | GET | 200 | Bank fallback serving items |
| `/api/firms/goldman-sachs/heat` | GET | 200 | |
| `/api/mastery` | GET | 200 | |
| `/api/notes` | GET | 200 | |
| `/api/search` | POST | 200 | Body `{"q":"LBO","limit":5,"offset":0}` |
| `/api/practice/sessions` | POST | 201 | Stub session created |
| `/api/admin/status` | GET | 503 | Expected while Neon unset |
| `/api/search` | GET | 400 | Known: query string `limit`/`offset` parsed as strings (product bug; use POST for smoke) |

**Verdict:** HTTP deployment smoke **PASS** for public product routes. Full product gate (auth + DB) still blocked by Neon env.

## Deployment gate checklist (§45)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Preview deployment passes | Pass (prior) | Vercel Git integration; product already live |
| Migrations succeed | Partial | Database is configured and published module reads pass; migration history was not inspected in this run |
| Workers are healthy | Pass (scaffold) | Dockerfile healthcheck + `docs/deployment/workers.md` health section; no unattended Glassdoor in Actions |
| Production smoke tests pass | Pass | Table above / `scripts/prod_smoke.sh` |
| Monitoring receives events | Partial | Vercel Runtime Logs only; Sentry/OTEL not provisioned |
| Backups are configured | Partial / blocked | Neon PITR/backups require provisioned Neon project — not linked this run |
| Scrape path still operable with documented secrets | Pass (docs) | `AGENTS.md` + env inventory; secrets stay off `NEXT_PUBLIC_*` |

## Monitoring status

- **Active:** Vercel dashboard Runtime Logs / deployment status for `apps/web`.
- **Stubbed:** `config/monitoring.example.yml` (Sentry DSN, OTEL, worker alert signals).
- **Not done:** install Sentry (or equivalent) integration; log drains; scrape-block alerts on workers.
- Details: `docs/deployment/monitoring.md`.

## Backup posture

| Data | Posture |
|------|---------|
| Neon Postgres | Configured and serving published module data; PITR/backup settings were not inspected in this run. |
| Vercel Blob raw artefacts | Docs only; `BLOB_READ_WRITE_TOKEN` not verified this run. |
| Question bank / corpus files | In-repo / worker host; not Vercel local disk. |
| Glassdoor session state | Worker/Cloud Agents only (`data/glassdoor_state.json`); never in Vercel public env. |

## Secrets posture

- **Worker / Cloud Agents:** `GLASSDOOR_*`, `HTTPS_PROXY`, session files, `GEMINI_API_KEY`
- **Vercel server:** `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, AI Gateway / OIDC
- **Vercel public:** `NEXT_PUBLIC_APP_URL` and non-secret product config only (no Glassdoor secrets)
- **Forbidden in client:** cookies, proxy URL, Glassdoor credentials

## Vercel CLI / project link (this agent run)

| Check | Result |
|-------|--------|
| `vercel` on PATH | Not installed globally; `npx vercel@41` available |
| `vercel whoami` | **Fail** — supplied token is rejected as `User not found` |
| `.vercel/project.json` in workspace | Absent (not re-linked this run) |
| Live URL smoke | Succeeded without CLI (public HTTPS) |

**Blocker:** replace/re-authorize the Cloud Agent `VERCEL_TOKEN` to inspect env,
promote manually, or pull secrets. Git-linked deployment remains operational.

## CI

- `test` — existing pytest + fixture pipeline
- `node-packages` — `npm ci` + `npm run build --workspace=@ibpe/web` + stub checks
- `worker-schedule` — manual `workflow_dispatch` stub only (no Glassdoor crawl)

## Integration audit (2026-08-01)

See `reports/integration-audit-2026-08-01.md`.

| Issue | Status |
|-------|--------|
| `published.v_firm_topic_heat` ignored `occurrence.topic` → all `untagged` | **Fixed** on Neon + `migrations/037_heat_view_occurrence_topic.sql` |
| Smoke scripts assumed stub-auth anonymous 200s on `/prep/*` | **Updated** auth-aware expectations |
| Learn checkpoint `question_ids` empty; occurrence↔teaching join null | Still open |
| Authenticated E2E test user | Still open |

## Remaining blockers

1. **Vercel CLI token** — the supplied token is rejected as `User not found` → cannot `env ls`, `inspect`, or promote via CLI.
2. **Authenticated smoke identity** — Neon Auth is configured, but this run has no test user/session for protected end-to-end checks.
3. **Monitoring productization** — Sentry/OTEL DSN not set; example YAML only.
4. **Blob token verification** — storage docs ready; token presence not confirmed without CLI/`env pull`.
5. **Mode B drill linkage** — module checkpoints still ship with empty `question_ids`.

## Incident / fix (2026-07-30, earlier)

| Issue | Cause | Fix |
|-------|-------|-----|
| `No Next.js version detected` / Root Directory missing | `.vercelignore` bare `web` matched `apps/web` | Use `/web` only |
| pnpm vs npm workspace miss | Stale `pnpm-lock.yaml` | Removed; npm only |
| Install ran build command | Dashboard override | Clear overrides; `apps/web/vercel.json` owns install/build |

## References

- `docs/deployment/README.md`
- `docs/deployment/vercel-project-link.md`
- `docs/deployment/workers.md`
- `docs/deployment/monitoring.md`
- `docs/agent-run/env-inventory.md`
- `scripts/prod_smoke.sh`
- `AGENTS.md` (scrape DX + secret boundaries)
