# Monitoring and error tracking

## Goals

| Signal | Product (`apps/web`) | Workers |
|--------|----------------------|---------|
| Request errors | Vercel Runtime Logs + error tracker | Structured job logs |
| Deploy health | Prod smoke (`scripts/prod_smoke.sh`) + QA | Schedule success/fail |
| Scrape blocks | N/A on Vercel | Alert on Cloudflare/block rates |
| Secret misuse | Lint / review: no `NEXT_PUBLIC_` scrape secrets | Env audit |

## Wave 3 status (2026-07-30)

| Integration | Status |
|-------------|--------|
| Vercel Runtime Logs | **Active** (dashboard; no CLI token needed to view in UI) |
| Production HTTP smoke | **Active** — `scripts/prod_smoke.sh` → `reports/deployment-report.md` |
| Worker exit-code signal | **Documented** — schedule runners treat non-zero as fail |
| Sentry (or equivalent) | **Not provisioned** — DSN names in `config/monitoring.example.yml` only |
| `@vercel/otel` | **Not wired** |
| Log drains | **Not configured** |
| Scrape-block alerts | **Not configured** (requires worker host metrics) |

## Stubs / wiring

1. **Vercel** — dashboard logs after deploy; with CLI auth: `vercel logs <url> --level error`.
2. **GitHub Actions** — CI job failure notifications (native); worker schedule workflow is dispatch-only until secrets exist.
3. **Config stub** — `config/monitoring.example.yml` lists intended integrations without enabling them.
4. **Health** — `GET /api/health` on `apps/web` (live; reports auth/db stub vs configured). Workers: see [workers.md](./workers.md) health section.

## Planned (when secrets available)

- Error tracking (e.g. Sentry) via Vercel integration — DSN as **server** env only
- Optional `@vercel/otel` on App Router
- Log drains to external sink if required by ops
- Worker dead-letter inspection remains `ibpe inspect-dead-letters` for corpus pipeline

## Do not

- Ship scrape cookies or `HTTPS_PROXY` into client analytics
- Treat CI green as scrape-success monitoring
- Put monitoring DSNs in `NEXT_PUBLIC_*`
