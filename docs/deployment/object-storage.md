# Object storage for raw artefacts

## What to store

| Artefact | Example path key | Access |
|----------|------------------|--------|
| Raw Glassdoor HTML | `raw/glassdoor/{job_id}/{page}.html` | private |
| BFF JSON pages | `raw/bff/{job_id}/{page}.json` | private |
| Screenshots | `raw/screenshots/{run_id}/...` | private |
| PDFs / exports | `exports/{run_id}/...` | private or signed |
| Large fixtures | `fixtures/...` | private |

Local gitignored mirrors today: `data/raw/glassdoor/*.html`, `data/db/*.db`. Product deploys must not rely on Vercel function local disk for persistence.

## Preferred provider (Wave 1 plan)

1. **Vercel Blob** (`@vercel/blob`) for app-adjacent private artefacts — provision via Vercel Marketplace / dashboard; inject `BLOB_READ_WRITE_TOKEN` as a **server** env on Vercel and on worker hosts.
2. Fallback: S3-compatible bucket (same key layout) if Blob is unavailable.

Use `access: 'private'` for scrape raw data. Do not expose Glassdoor HTML/JSON via public Blob URLs.

Neon Postgres holds structured corpus rows; Blob holds bulky raw blobs. Do **not** use sunset `@vercel/postgres` / `@vercel/kv`.

## Env

| Var | Where | Notes |
|-----|-------|-------|
| `BLOB_READ_WRITE_TOKEN` | Vercel (server) + worker | Secret |
| `BLOB_BASE_PREFIX` | optional config | e.g. `concord-prod/` |

Never prefix Blob tokens with `NEXT_PUBLIC_`.

## Wiring stub

Worker-side upload helper is intentionally not implemented in Wave 1 (avoids coupling to scrape code). When glassdoor/data-quality emit raw files, call put/list/del from `@vercel/blob` (or S3 SDK) inside **worker** steps only.

See `apps/worker/jobs/README.md` for enqueue/upload hook points.
