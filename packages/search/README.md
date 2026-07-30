# `@ibpe/search`

Hybrid retrieval for IB/PE interview prep: lexical (FTS/trigram-style) ranking, firm **topic heat** from Glassdoor bank/occurrence signals, and a **pseudo-RAG pack builder** that freezes cited teaching Q/A.

## Backend mode (Wave 2)

| Layer | Status |
|-------|--------|
| In-memory lexical + metadata + heat | **Default** — works offline over `exports/` + `data/question_bank.json` / fixtures |
| Neon FTS / `pg_trgm` / pgvector | **Not provisioned yet** — adapters will swap in when `published.v_*` + embeddings land |
| Live Glassdoor scrape | **Never** — heat uses bank/exports/DB only (ADR 0002 / 0006) |

Teaching truth = GitHub / curated Q/A (`github_source`, `static_seed`). Glassdoor rows contribute **heat signals only** (`glassdoor_occurrence`) — never uncited web answers.

## Exports

```ts
import {
  buildTopicHeat,
  searchCorpus,
  buildFacets,
  buildPseudoRagPack,
  loadTeachingCorpusFromSeed,
  loadBankQuestions,
} from "@ibpe/search";
```

## Demo

```bash
npm run demo -w @ibpe/search
```

## Tests

```bash
npm test -w @ibpe/search
```
