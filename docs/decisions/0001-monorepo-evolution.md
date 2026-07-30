# ADR 0001 — Monorepo evolution from Python-first Concord

## Status

Accepted (Phase 0 freeze)

## Context

Repo is GlassCleaner2/Concord (Python scraper + Flask UI + absorbed `ibpe_corpus`). Product target is Next.js on Vercel with durable workers.

## Decision

Evolve in place to:

```text
apps/web          # Next.js product
apps/worker       # scrape / transform / enrich jobs
packages/{contracts,ui,database,config,...}
main.py           # keep as CLI shim
scrapers/         # live crawl until relocated behind packages/scraper
src/ibpe_corpus/  # teaching pipeline until packages absorb it
web/              # Flask interim operator UI
```

Storage: **Neon Postgres** (not sunset `@vercel/postgres`). Auth: **Neon Auth** for product (Wave 2; ADR 0006). Glassdoor scrape login stays Patchright + manual captcha (BFF legacy/optional).

## Consequences

- Wave 1 streams scaffold packages without deleting Python entrypoints.
- Contracts are Zod-first with Pydantic mirror in `src/ibpe_corpus/schemas`.
- Long scrapes never run inside serverless request handlers.
