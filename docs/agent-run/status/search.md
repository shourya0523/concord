# Status: search

State: in_progress → pack/heat shipped (Wave 2)
Wave: 2
Branch: `local/ws-search-a9ff`
Updated: 2026-07-30

## Done

- [x] Scaffold `packages/search` (`@ibpe/search`)
- [x] In-memory hybrid ranker (token FTS-ish + trigram + lexical-vector + metadata)
- [x] Firm topic heat from Glassdoor **bank** (no live scrape); intensity matches `v_firm_topic_heat`
- [x] Facet helpers for topics/domains/provenance/difficulty
- [x] Pseudo-RAG pack builder: retrieve → heat/weakness filter → rerank → freeze + cite
- [x] Pack metadata explains weak-topic and heat hits
- [x] Types aligned with `@ibpe/contracts` (`SearchRequest/Response`, `TopicHeat`, `PseudoRagPack`, `Provenance`)
- [x] Unit tests + `npm run demo -w @ibpe/search`
- [x] `reports/search-evaluation.md` started

## Backend note

Default = deterministic in-memory over fixtures / bank / exports. Neon FTS / pg_trgm / pgvector **not required** yet — documented in package README + evaluation report.

## Not owned / deferred

- `apps/web` feature pages (frontend)
- Neon Auth routes (backend)
- Production embedding index via AI SDK `embed()` (ready to swap when vectors provisioned)
