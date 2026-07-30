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
python main.py batch --backend bff --track PE --limit 1 --force
ibpe run-pipeline --mode fixtures --force
```

Use residential `HTTPS_PROXY` and session files only on worker / agent hosts — not in the browser bundle.

## Container stub

```bash
docker build -t concord-worker -f apps/worker/Dockerfile .
# docker run --env-file .env concord-worker
```

Image entrypoint is a placeholder until Wave 2/3 job images are finalized.

## Scheduled job wiring (stub)

1. **GitHub Actions** — `.github/workflows/worker-schedule.yml` (`workflow_dispatch` only in Wave 1; enable `schedule:` when secrets + host are ready).
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
