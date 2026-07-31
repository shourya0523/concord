# Remaining product gaps (non-UI)

**Branch:** `local/real-rag-product-gaps-d1de`  
**Updated:** 2026-07-31  
**Scope:** Backend / data / search / ops — **UI owned by another branch (do not thrash).**

## Done in this pass

| Item | Status |
|------|--------|
| Merge Wave 3 (#25) into `main` | Done |
| Sibling backend APIs (attempts, mastery, bookmarks, study-plan, targets, prep) | Already on `main` |
| Teaching Q/A → Neon `published.v_*` | **416** questions + answers |
| `pgvector` + `canonical.rag_documents` (033) | Applied on Neon production |
| Gemini embeddings (768-d) index | `npm run embed:rag` |
| `/api/search` → real RAG hybrid | Wired (`apps/web/lib/data/rag.ts`) |
| `/api/prep/rag` → real RAG pack | Wired (lexical fallback if embed fails) |

## Still open (non-UI)

### P0 — harden real RAG
1. Grounded LLM synthesis on pack (cite-only `generateText`) — retrieve works; answer paragraph optional.
2. Put `GEMINI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`) on **Vercel** Production so prod RAG is dense, not lexical fallback.
3. Cron/worker to re-embed on teaching publish (`embed:rag` after `publish:teaching`).
4. Topic tagging on Glassdoor heat (mostly `untagged`) — glassdoor/data-quality.

### P1 — data / license
5. License gate still **BLOCKING** for some GitHub sources (`reports/license-review.md`) before expanding teaching corpus.
6. Live Gemini enrich batch → Mode A/B graphs (answers stream; durable worker).
7. Dedup / entity resolution polish beyond current exports.

### P1 — backend domain polish
8. Notes **write** (POST/PATCH/DELETE) if not finished on sibling branch — verify against live auth.
9. Recommendations endpoint (weak-topic / firm prep) using `@ibpe/search` `recommendForTargets`.
10. Admin APIs beyond 501 stub.
11. Rate limits + audit events on sensitive routes.
12. Ensure first sign-in always upserts `app.users` (Neon Auth id).

### P2 — ops
13. Sentry / OTEL monitoring.
14. Neon PITR retention beyond 6h; Blob for raw artefacts.
15. Worker host deploy + schedules (enrich + embed + scrape enqueue only).
16. Agent/CI `VERCEL_TOKEN` for promote (Git deploy already works).

## Explicitly out of scope here
- Frontend Learn / Mode A/B page polish (other branch).
- Flask operator UI replacement.

## Commands

```bash
DATABASE_URL=… npm run migrate -w @ibpe/database
DATABASE_URL=… npm run publish:teaching -w @ibpe/database
DATABASE_URL=… GEMINI_API_KEY=… npm run embed:rag -w @ibpe/database
```
