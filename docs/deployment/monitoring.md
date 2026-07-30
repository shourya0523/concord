# Monitoring and error tracking (stubs)

## Goals

| Signal | Product (`apps/web`) | Workers |
|--------|----------------------|---------|
| Request errors | Vercel Runtime Logs + error tracker | Structured job logs |
| Deploy health | Preview/prod smoke (QA Wave 3) | Schedule success/fail |
| Scrape blocks | N/A on Vercel | Alert on Cloudflare/block rates |
| Secret misuse | Lint / review: no `NEXT_PUBLIC_` scrape secrets | Env audit |

## Wave 1 stubs

1. **Vercel** — use dashboard logs after first preview deploy (`vercel logs <url> --level error`).
2. **GitHub Actions** — CI job failure notifications (native); worker schedule workflow is dispatch-only until secrets exist.
3. **Config stub** — `config/monitoring.example.yml` lists intended integrations (Sentry/OTEL) without enabling them.
4. **Health** — planned `GET /api/health` on `apps/web` (backend Wave 2); workers echo exit codes to schedule runners.

## Planned integrations (Wave 3)

- Error tracking (e.g. Sentry) via Vercel integration — DSN as server env only
- Optional `@vercel/otel` on App Router
- Log drains to external sink if required by ops
- Worker dead-letter inspection remains `ibpe inspect-dead-letters` for corpus pipeline

## Do not

- Ship scrape cookies or `HTTPS_PROXY` into client analytics
- Treat CI green as scrape-success monitoring
