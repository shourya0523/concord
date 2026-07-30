# Deployment report (Workstream J)

**Wave:** 1 (CI / scaffold)  
**Branch:** `local/ws-infra-a9ff`  
**Updated:** 2026-07-30

## Plan (preview → production)

1. Scaffold `vercel.json`, ignore rules, and link docs (`docs/deployment/`).
2. Keep Python pytest CI; add Node package placeholder checks for monorepo stubs.
3. Wire worker schedule stubs (dispatch-only) — no unattended Glassdoor crawl in Actions.
4. When `apps/web` has a Next.js app + `VERCEL_TOKEN` / org / project IDs: create **preview** deploy.
5. QA validates preview; **promote** to production (`vercel promote` or production branch).
6. Wave 3: monitoring integrations, backups, prod smoke.

## Topology

| Component | Target | Wave 1 status |
|-----------|--------|---------------|
| Next.js product | Vercel (`apps/web`) | Scaffold + docs only |
| Scrapers / enrich | `apps/worker` / Cloud Agents | Dockerfile + schedule stubs |
| Object storage | Vercel Blob (private) | Docs + env names |
| DB | Neon (marketplace) | Documented; provision later |
| CI | GitHub Actions | Extended `ci.yml` |

## URLs

| Environment | URL | Notes |
|-------------|-----|-------|
| Preview | _pending_ | Blocked — no live Vercel login / Next app in this run |
| Production | _pending_ | After preview validation (Wave 3) |

## Blockers (Wave 1)

| Blocker | Impact | Resolution |
|---------|--------|------------|
| No Vercel CLI auth in this cloud agent (`vercel` not logged in; deploy not required for Wave 1) | Cannot `vercel link` / preview URL | Operator runs link locally or adds `VERCEL_TOKEN` + Git integration |
| `apps/web` is README stub (Next.js lands Wave 2 / architecture) | Cannot build product on Vercel yet | Root `vercel.json` ready; set Root Directory = `apps/web` when app exists |
| Scrape secrets must stay off Vercel public env | N/A (by design) | Documented in `AGENTS.md` + deployment docs |

## Secrets posture

- **Worker / Cloud Agents:** `GLASSDOOR_*`, `HTTPS_PROXY`, session files, `GEMINI_API_KEY`
- **Vercel server:** `DATABASE_URL`, Clerk secrets, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, AI Gateway / OIDC
- **Vercel public:** `NEXT_PUBLIC_CLERK_*` and non-secret product config only
- **Forbidden in client:** cookies, proxy URL, Glassdoor credentials

## CI

- `test` — existing pytest + fixture pipeline
- `node-packages` — `scripts/ci_node_packages.sh` (manifest parse + `@ibpe/contracts` tsc)
- `worker-schedule` — manual stub only

## References

- `docs/deployment/README.md`
- `docs/agent-run/env-inventory.md`
- `AGENTS.md` (scrape DX + secret boundaries)
