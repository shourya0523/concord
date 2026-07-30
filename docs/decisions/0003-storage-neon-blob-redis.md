# ADR 0003 — Storage: Neon Postgres, Vercel Blob, Upstash Redis

## Status

Accepted (Wave 1)

## Context

Product needs relational data, artefact blobs, and short-lived coordination/cache. First-party `@vercel/postgres` and `@vercel/kv` are sunset.

## Decision

| Need | Choice | Package / var |
|------|--------|----------------|
| Primary DB | Neon Postgres (Marketplace) | `@neondatabase/serverless`, `DATABASE_URL` |
| ORM (Wave 1–2) | Drizzle preferred (database stream owns) | `drizzle-orm` |
| Unstructured artefacts | Vercel Blob | `@vercel/blob`, `BLOB_READ_WRITE_TOKEN` |
| Cache / rate limit / job locks | Upstash Redis | `@upstash/redis`, `UPSTASH_REDIS_*` |
| Feature flags at edge | Edge Config (optional) | `@vercel/edge-config`, `EDGE_CONFIG` |

Local SQLite in `src/ibpe_corpus/storage` remains valid for corpus pipeline until Neon cutover.

## Consequences

- Do not add `@vercel/postgres` or `@vercel/kv`.
- Lazy-init DB clients so `next build` does not require secrets at import time.
- Glassdoor session files stay on disk / gitignored — not Blob-public.
