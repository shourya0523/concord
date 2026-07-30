# Status: infra

State: wave1-complete (scaffold; live deploy blocked)
Wave: 1
Branch: `local/ws-infra-a9ff`
Updated: 2026-07-30

## Objective

CI/Vercel scaffold, worker + storage + monitoring docs/stubs, preserve scrape secret hygiene.

## Done

- Root `vercel.json` + `.vercelignore` for Next.js product posture (`apps/web` root directory)
- `docs/deployment/*` — project link, workers, object storage, monitoring
- Extended `.github/workflows/ci.yml` with Node package checks; added `worker-schedule.yml` stub
- `apps/worker` Dockerfile, schedule/env examples, job wiring stubs
- `config/monitoring.example.yml`
- `reports/deployment-report.md` (preview→prod plan + blockers)
- Additive `AGENTS.md` + `.env.example` notes: scrape secrets ≠ Vercel public/`NEXT_PUBLIC_*`

## Files

- `vercel.json`, `.vercelignore`
- `.github/workflows/ci.yml`, `.github/workflows/worker-schedule.yml`
- `scripts/ci_node_packages.sh`
- `docs/deployment/**`
- `apps/worker/**` (scaffold)
- `config/monitoring.example.yml`
- `reports/deployment-report.md`
- `AGENTS.md`, `.env.example`, `.gitignore` (additive)

## Tests

- Local: `bash scripts/ci_node_packages.sh`
- Local: `pytest -q` (existing)
- CI jobs: `test`, `node-packages`

## Blockers

- Live Vercel link/deploy not run (no CLI login required for Wave 1; Next app stub only)
- Recorded in `reports/deployment-report.md`

## Deps / integration

- Merge after architecture/database/design-system per integration plan
- Wave 3: preview URL → promote + monitoring

## Notes

Hard rule enforced in docs: scrapers on workers; never long crawl in serverless request timeouts.
