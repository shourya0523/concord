# Worker deployment (scrape / transform / enrich)

## Why separate from Vercel request handlers

Glassdoor BFF crawls, Patchright sessions, fixture pipelines, and Gemini enrich batches run for minutes to hours. Vercel Functions (even Fluid Compute max duration) are the wrong place for long crawls.

| Workload | Where | Trigger |
|----------|-------|---------|
| Product SSR / API | `apps/web` on Vercel | HTTP |
| Enqueue / status stubs | Optional short cron route | Vercel Cron → queue |
| Batch scrape (`--backend bff`) | Worker host / Cloud Agents | Schedule or dispatch |
| Corpus transform / publish | Worker or `ibpe` CLI | Schedule or dispatch |
| Gemini enrich | Worker (answers stream) | Schedule or dispatch |
| Durable multi-step jobs | Vercel Workflow DevKit (Wave 2+) | `start()` from API; steps on workers as needed |

## Layout

```text
apps/worker/
  README.md
  Dockerfile                 # container image stub
  schedule.example.yml       # cron / schedule examples
  jobs/                      # wiring stubs (no scrape logic)
  .env.worker.example        # secret names for worker hosts
```

Job **logic** remains owned by glassdoor / data-quality / answers. Infra owns deploy wiring and secret placement.

## Local / Cloud Agents (current DX)

Documented in `AGENTS.md`:

```bash
source .venv/bin/activate
# Preferred (ADR 0006): Patchright session — not long-running on Vercel
python main.py login
python main.py batch --track PE --limit 1
ibpe run-pipeline --mode fixtures --force
```

Legacy `--backend bff` remains in-repo but is not the programme default. Keep `HTTPS_PROXY` and session files on worker / agent hosts only — not in the browser bundle.

## Container stub

```bash
docker build -t concord-worker -f apps/worker/Dockerfile .
# docker run --env-file .env concord-worker
```

Image entrypoint is a placeholder until job images are finalized. Default `CMD` only prints a stub message (safe).

## Health checks (Wave 3)

Workers are **not** HTTP services on Vercel. Health = image boots + Python import path works + scheduled job exit codes.

```bash
# 1) Image builds
docker build -t concord-worker -f apps/worker/Dockerfile .

# 2) Container HEALTHCHECK (Dockerfile) — installed package + scrape tree present
docker run --rm concord-worker \
  python -c "from pathlib import Path; import ibpe_corpus; assert Path('scrapers').is_dir(); assert Path('main.py').is_file(); print('worker_health_ok')"

# 3) Host / schedule success signal
#    Exit code 0 from enqueue/enrich scripts; non-zero → alert (see monitoring.md)
# 4) GitHub Actions stub still dispatch-only — does NOT crawl Glassdoor
```

| Check | How | Pass |
|-------|-----|------|
| Dockerfile present | `apps/worker/Dockerfile` | Builds from repo root |
| Import health | `python -c "import ibpe_corpus"` (+ `scrapers/` + `main.py` present) | Exit 0 |
| Schedule wiring | `.github/workflows/worker-schedule.yml` | `workflow_dispatch` only; no unattended scrape |
| Secrets placement | `apps/worker/.env.worker.example` | Names only; no `NEXT_PUBLIC_*` |

## Scheduled job wiring (stub)

1. **GitHub Actions** — `.github/workflows/worker-schedule.yml` (`workflow_dispatch` only; enable `schedule:` when secrets + host are ready). **Never** enable unattended Glassdoor crawl in Actions without proxy + session review.
2. **Host cron** — see `apps/worker/schedule.example.yml`.
3. **Vercel Cron** — HTTP enqueue only; worker pulls and runs Python.

Do not enable unattended Glassdoor scrapes in CI without proxy + cookie secrets and rate-limit review.

## Secrets on workers

| Var | Required for |
|-----|----------------|
| `HTTPS_PROXY` | BFF crawls from datacenter IPs |
| `GLASSDOOR_*` | Browser / login paths |
| `GEMINI_API_KEY` | Enrich jobs |
| `DATABASE_URL` | Publish to Neon (when provisioned) |
| `BLOB_READ_WRITE_TOKEN` | Upload raw artefacts |

Same names as Cloud Agents Secrets; never `NEXT_PUBLIC_*`.
