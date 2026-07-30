# Architecture

## Data thesis

```text
GitHub / curated Q/A  ──► teaching truth (answers, concepts)
Glassdoor bank/scrape ──► firm signals only (occurrences, topic heat)
Gemini                ──► enrich (tags, diagrams, synthesised drafts)
Validators/editorial  ──► gate correctness before publish
```

Never treat Glassdoor review prose as authoritative answer text. Never label synthesised content as `source_provided`.

## Product modes

| Mode | Focus | Primary inputs |
|------|-------|----------------|
| **A — Company prep** | What Firm X asks | Glassdoor heat × published Q/A |
| **B — Concept labs** | Master finance concepts | GitHub + diagrams + resources |

## System context

```text
┌─────────────────────────────────────────────────────────────┐
│  apps/web (Next.js App Router) — Wave 2                     │
│  Neon Auth · RSC · route handlers · @ibpe/ui                │
└─────────────┬───────────────────────────────▲───────────────┘
              │                               │
              ▼                               │
┌──────────────────────┐            ┌─────────┴──────────────┐
│  Neon Postgres       │◄───────────│  packages/search       │
│  (+ pgvector later)  │            │  hybrid / pseudo-RAG   │
└──────────▲───────────┘            └────────────────────────┘
           │
┌──────────┴──────────────────────────────────────────────────┐
│  apps/worker + python main.py                               │
│  scrapers/ (browser; BFF legacy) · ibpe_corpus · Gemini     │
└──────────┬──────────────────────────────────────────────────┘
           │
     Vercel Blob (raw artefacts) · Upstash (locks/cache)
```

## Monorepo layout (target)

```text
apps/
  web/                 # Next.js product (stub Wave 1)
  worker/              # Job hosts (stub Wave 1)
packages/
  contracts/           # Zod shared schemas ← architecture
  config/              # Env + feature flags ← architecture
  domain/              # Pure helpers ← architecture
  database/            # Drizzle/SQL ← database stream
  ui/                  # shadcn DS ← design-system
  search/              # Wave 2
  ai/                  # Enrich helpers ← answers
  validation/          # Answer validators ← answers
main.py                # PRESERVED CLI shim
scrapers/              # Live Glassdoor crawl
src/ibpe_corpus/       # Teaching pipeline
web/                   # Flask interim operator UI
data/question_bank.json
```

## Migration path

| Phase | Action |
|-------|--------|
| **0** (done) | Freeze minimum contracts; scaffold dirs; ownership map |
| **Wave 1** | Expand contracts; DS/DB/infra stubs; Glassdoor signals; GitHub import; Gemini skeleton |
| **Wave 2** | Next.js product + APIs + search; bank → Neon importer |
| **Wave 3** | Verification, promote, retire Flask as primary UX |

### CLI preservation

```bash
python main.py login
python main.py batch --backend browser --track PE --limit 1
python main.py query --track IB
python main.py ui --port 5050
```

These entrypoints remain until workers absorb them behind the same argv surface (ADR 0004).

## Pipeline stages

```text
discover → fetch/archive → extract → classify PE → canonicalise
        → answer (source|match|synth) → validate → export/publish
```

Jobs are restartable with idempotency keys. Prefer `JobEvent` contracts for progress.

## Contracts

Shared Zod package: `@ibpe/contracts` (`packages/contracts`).  
Python mirror: `src/ibpe_corpus/schemas/models.py`.

Key entities: `BankQuestion`, `CompletedJob`, `CanonicalQuestion`, `InterviewOccurrence`, `Answer`, `Firm`, `Role`, `Attempt`, `Mastery`, `SearchRequest`/`SearchResponse`, `JobEvent`, `ApiError`, `TopicTaxonomy`.

## Runtime choices

| Layer | Choice |
|-------|--------|
| Web | Next.js App Router on Vercel (Node runtime default) |
| Auth (product) | Neon Auth — not Glassdoor SSO (ADR 0006) |
| DB | Neon Postgres |
| Blobs | Vercel Blob |
| Cache | Upstash Redis |
| Scrape | Python + Patchright / manual captcha (BFF legacy) |
| Enrich | Gemini via worker (`GEMINI_API_KEY`); app prefers AI Gateway |

## Logging & errors

- Structured logs: `job_name`, `idempotency_key`, `request_id`, `track`, `backend`.
- API failures use `ApiErrorSchema` (`code`, `message`, `retryable`).
- Scrape blocks (`captcha`, `blocked`) are typed access states — not silent empty success.
- Never log Glassdoor cookies, proxy passwords, or TOTP secrets.

## Environment

Validated by `@ibpe/config`. Extend `.env.example` only with placeholder names. Server-only keys listed in `SERVER_ONLY_ENV_KEYS`.

## Related ADRs

- [0001 Monorepo evolution](./decisions/0001-monorepo-evolution.md)
- [0002 Data thesis](./decisions/0002-data-thesis-github-glassdoor-gemini.md)
- [0003 Storage](./decisions/0003-storage-neon-blob-redis.md)
- [0004 CLI preservation](./decisions/0004-preserve-python-cli.md)
- [0005 Zod/Pydantic contracts](./decisions/0005-zod-pydantic-contracts.md)
