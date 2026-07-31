# Deployment (Workstream J)

Wave 3 promote docs for Concord / GlassCleaner2 product deploy topology.

| Doc | Purpose |
|-----|---------|
| [vercel-project-link.md](./vercel-project-link.md) | Link `apps/web` to Vercel; preview → production |
| [workers.md](./workers.md) | Scrape / transform / enrich workers + health checks |
| [object-storage.md](./object-storage.md) | Raw HTML/JSON/PDF artefact storage |
| [monitoring.md](./monitoring.md) | Logs, error tracking, Wave 3 status |
| [../agent-run/env-inventory.md](../agent-run/env-inventory.md) | Secret vs public env inventory |

**Hard rule:** Next.js on Vercel; long Glassdoor crawls and batch enrich on workers / durable workflows — never inside ordinary serverless request timeouts.

## Quick commands

```bash
export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"

# Production HTTP smoke (deployment gate)
BASE_URL=https://concord-umber.vercel.app bash scripts/prod_smoke.sh

# Worker import health (no scrape)
docker build -t concord-worker -f apps/worker/Dockerfile .
# or: python -c "import scrapers, ibpe_corpus; print('worker_health_ok')"
```

See `reports/deployment-report.md` for Wave 3 smoke results, monitoring/backup posture, and blockers (Vercel token, Neon).
