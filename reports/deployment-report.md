# Deployment report (Workstream J)

**Wave:** 2+ (product live on Vercel)  
**Branch:** `main`  
**Updated:** 2026-07-30

## Plan (preview → production)

1. Scaffold `vercel.json`, ignore rules, and link docs (`docs/deployment/`).
2. Keep Python pytest CI; add Node package checks + `npm ci` / web build guard.
3. Wire worker schedule stubs (dispatch-only) — no unattended Glassdoor crawl in Actions.
4. ~~When `apps/web` has a Next.js app…~~ **Done** — preview + production live.
5. QA validates preview (Wave 3 ongoing).
6. Wave 3: monitoring integrations, backups, prod smoke.

## Topology

| Component | Target | Status |
|-----------|--------|--------|
| Next.js product | Vercel (`apps/web`) | Live |
| Scrapers / enrich | `apps/worker` / Cloud Agents | Dockerfile + schedule stubs |
| Object storage | Vercel Blob (private) | Docs + env names |
| DB | Neon (marketplace) | Documented; auth/DB stubbed when unset |
| CI | GitHub Actions | `npm ci` + `@ibpe/web` build |

## URLs

| Environment | URL | Notes |
|-------------|-----|-------|
| Production | https://concord-umber.vercel.app | Alias: https://concord-shourya0523s-projects.vercel.app |
| Preview | Git branch previews via Vercel Git integration | Root Directory = `apps/web` |

## Incident / fix (2026-07-30)

| Issue | Cause | Fix |
|-------|-------|-----|
| `No Next.js version detected` / Root Directory missing | `.vercelignore` bare `web` matched `apps/web` | Use `/web` only |
| pnpm vs npm workspace miss | Stale `pnpm-lock.yaml` | Removed; npm only |
| Install ran build command | Dashboard override | Clear overrides; `apps/web/vercel.json` owns install/build |

## Secrets posture

- **Worker / Cloud Agents:** `GLASSDOOR_*`, `HTTPS_PROXY`, session files, `GEMINI_API_KEY`
- **Vercel server:** `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, AI Gateway / OIDC
- **Vercel public:** `NEXT_PUBLIC_APP_URL` and non-secret product config only (no Glassdoor secrets)
- **Forbidden in client:** cookies, proxy URL, Glassdoor credentials

## CI

- `test` — existing pytest + fixture pipeline
- `node-packages` — `npm ci` + `npm run build --workspace=@ibpe/web` + stub checks
- `worker-schedule` — manual stub only

## References

- `docs/deployment/README.md`
- `docs/deployment/vercel-project-link.md`
- `docs/agent-run/env-inventory.md`
- `AGENTS.md` (scrape DX + secret boundaries)
