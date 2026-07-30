# Deployment (Workstream J)

Wave 1 scaffold for Concord / GlassCleaner2 product deploy topology.

| Doc | Purpose |
|-----|---------|
| [vercel-project-link.md](./vercel-project-link.md) | Link `apps/web` to Vercel; preview → production |
| [workers.md](./workers.md) | Scrape / transform / enrich workers (not serverless request path) |
| [object-storage.md](./object-storage.md) | Raw HTML/JSON/PDF artefact storage |
| [monitoring.md](./monitoring.md) | Logs, error tracking, health stubs |
| [../agent-run/env-inventory.md](../agent-run/env-inventory.md) | Secret vs public env inventory |

**Hard rule:** Next.js on Vercel; long Glassdoor crawls and batch enrich on workers / durable workflows — never inside ordinary serverless request timeouts.

See also `reports/deployment-report.md` for Wave status and blockers.
