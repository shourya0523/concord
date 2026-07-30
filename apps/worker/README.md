# apps/worker

Scrape / transform / enrich workers. Infra scaffolds deploy; job logic owned by glassdoor / data-quality / answers.

**Hard rule:** never run long Glassdoor crawls inside Vercel serverless **request** timeouts. Prefer Cloud Agents / this image / host cron. GitHub Actions `worker-schedule.yml` is dispatch-only by default (no unattended crawl).

## Health (Wave 3)

```bash
# From repo root
docker build -t concord-worker -f apps/worker/Dockerfile .

# Import health (same as Dockerfile HEALTHCHECK) — no network scrape
docker run --rm concord-worker \
  python -c "from pathlib import Path; import ibpe_corpus; assert Path('scrapers').is_dir(); assert Path('main.py').is_file(); print('worker_health_ok')"

# Or on a host with editable install
source .venv/bin/activate
pip install -e .
python -c "from pathlib import Path; import ibpe_corpus; assert Path('scrapers').is_dir(); print('worker_health_ok')"
```

Schedule success = job exit code 0. See `docs/deployment/workers.md` and `docs/deployment/monitoring.md`.

## Gemini enrichment (Workstream H)

Runs **offline** (not on browse request path):

```bash
source .venv/bin/activate
# Heuristic dry-run (no API key)
python -m ibpe_corpus.answers.enrich_job --dry-run --limit 20

# Live model (Cloud Agents Secrets / .env)
# GEMINI_API_KEY=...  or AI_GATEWAY_API_KEY=...
python -m ibpe_corpus.answers.enrich_job --limit 50
```

Report: `reports/answer-enrichment-report.json`

Provenance: all Gemini outputs are `gemini_synthesised` — never Glassdoor / GitHub teaching source.

## Secrets

Copy names from `.env.worker.example`. Keep Glassdoor / proxy / session files off Vercel `NEXT_PUBLIC_*`. Product env inventory: `docs/agent-run/env-inventory.md`.
