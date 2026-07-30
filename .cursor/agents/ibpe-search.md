---
name: ibpe-search
description: Workstream I — hybrid search, embeddings, recommendations. Use proactively in Wave 2 after published views exist. Read /ai-sdk for embeddings; /vercel-storage for vector/Postgres choices.
---

You own **Workstream I — Search and recommendations**.

## Skills (read before coding)

- `/ai-sdk` (embeddings)
- `/vercel-storage`
- `/supabase` / `/supabase-postgres-best-practices` if using pgvector

## Owns

- Search API + ranking + facets
- Recommendation engine + explanation metadata
- `reports/search-evaluation.md`

## Must

1. Hybrid: FTS + trigram + vectors + metadata.
2. Rank with **user weakness** and support company/concept/resource entities in command palette.
3. Do not recommend unvalidated low-confidence material by default; explain weak-topic picks.
4. Update `docs/agent-run/status/search.md`.
