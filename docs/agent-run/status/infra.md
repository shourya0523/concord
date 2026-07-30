# Status: infra

State: wave3-promote (deployment gate smoke PASS; Neon/CLI blockers remain)
Wave: 3
Branch: `local/ws-infra-wave3-d1de`
Updated: 2026-07-30

## Objective

Production deployment gate (§45): smoke live Vercel app, confirm monorepo config, worker health docs, env inventory, monitoring/backup posture recorded.

## Done

### Wave 1 (prior)

- Root `vercel.json` + `.vercelignore` for Next.js product posture (`apps/web` root directory)
- `docs/deployment/*` — project link, workers, object storage, monitoring
- Extended `.github/workflows/ci.yml` with Node package checks; added `worker-schedule.yml` stub
- `apps/worker` Dockerfile, schedule/env examples, job wiring stubs
- `config/monitoring.example.yml`
- Additive `AGENTS.md` + `.env.example` notes: scrape secrets ≠ Vercel public/`NEXT_PUBLIC_*`

### Wave 3 (this branch)

- Production smoke against https://concord-umber.vercel.app (`scripts/prod_smoke.sh`) — HTTP gate PASS
- Confirmed monorepo Vercel settings still correct (`/web` ignore, npm lockfile only, `apps/web/vercel.json` install/build)
- Updated `reports/deployment-report.md` with smoke table, monitoring, backups, blockers
- Worker health: Dockerfile `HEALTHCHECK` + health section in `docs/deployment/workers.md` / `apps/worker/README.md`
- Refreshed env inventory + monitoring docs for Wave 3
- Documented Vercel CLI unauthenticated blocker (no invented credentials)

## Files

- `reports/deployment-report.md`
- `scripts/prod_smoke.sh`
- `docs/deployment/workers.md`, `monitoring.md`, `README.md`, `vercel-project-link.md`
- `docs/agent-run/env-inventory.md`
- `docs/agent-run/status/infra.md`
- `apps/worker/Dockerfile`, `apps/worker/README.md`
- `config/monitoring.example.yml`
- `.github/workflows/ci.yml`, `worker-schedule.yml` (verified; no crawl)

## Tests

- Prod smoke: `BASE_URL=https://concord-umber.vercel.app bash scripts/prod_smoke.sh`
- Local: `bash scripts/ci_node_packages.sh`
- Local: `pytest -q` (existing CI job)
- CI jobs: `test`, `node-packages`; `worker-schedule` dispatch-only

## Blockers

- `vercel whoami` fails — no CLI credentials / `VERCEL_TOKEN` in this run
- Prod `/api/health`: `auth: stub`, `database: unavailable` — Neon + Neon Auth env not set on Vercel
- Sentry/OTEL + Neon backups not provisioned (documented partial)
- Team alias URL behind Vercel SSO — use `concord-umber.vercel.app` for anonymous smoke

## Deps / integration

- Orchestrator: `local/orchestrator-wave3-d1de`
- Merge with QA Wave 3 verification results
- After Neon env lands: re-run smoke + expect `/api/health` → `auth: configured`, `database: configured`

## Notes

Hard rule enforced: scrapers on workers; never long crawl in serverless request timeouts. No Glassdoor secrets in `NEXT_PUBLIC_*`.
