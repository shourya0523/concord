# ADR 0007 — OpenRouter as the single LLM gateway (cost-optimised tiers)

## Status

Accepted (2026-09-23). Supersedes the Gemini / Vercel AI Gateway choice in ADR 0002 for
*which* model enriches; ADR 0002's data thesis (GitHub = teaching truth, Glassdoor = firm
signals, LLM = synthesised enrichment) is unchanged.

## Context

Enrichment (taxonomy, rubric drafts, answer-expansion proposals, signal topic tags) called
Google Gemini directly (`GEMINI_API_KEY`, `generativelanguage.googleapis.com`) or via the
Vercel AI Gateway (`AI_GATEWAY_API_KEY`). That meant two keys, one provider, no fallback, and
a model call for every item even when the deterministic heuristics already produced an
auto-approvable result. Owner direction: move to a cost-optimised stack — a primary model
("Jev") on OpenRouter and a very small LLM **only when required** (Gemini-on-OpenRouter, GLM
and DeepSeek are all acceptable).

"Jev" is not in the OpenRouter catalogue at the time of writing, so every model id is an env
setting, never a code constant that callers depend on.

## Decision

1. **OpenRouter is the only LLM gateway** for the Python worker (`src/ibpe_corpus/answers/llm_client.py`):
   `POST {OPENROUTER_BASE_URL:-https://openrouter.ai/api/v1}/chat/completions` with
   `Authorization: Bearer $OPENROUTER_API_KEY`, `X-Title: Concord`, structured output via
   `response_format: {type: "json_schema", json_schema: {name, strict: true, schema}}` generated
   from the Pydantic models, `models: [<tier model>, $LLM_FALLBACK_MODEL]` for provider
   fallback, and `usage: {include: true}` so token cost is reported. Replies are validated with
   Pydantic; 429 / 5xx / transport errors retry with exponential backoff (honouring
   `Retry-After`); errors are typed and never carry the key.
2. **Tiers** (all env-configurable):

   | Tier | Env | Default | Used for |
   |------|-----|---------|----------|
   | small | `LLM_SMALL_MODEL` | `deepseek/deepseek-v4-flash` | **Default for all enrichment**. Alternatives: `z-ai/glm-4.5-air`, `google/gemini-2.5-flash-lite` |
   | primary ("Jev") | `LLM_PRIMARY_MODEL` | `deepseek/deepseek-v4.1-flash` (placeholder until Jev is listed) | Only `--tier primary`, or a small-model draft that failed validation once |
   | fallback | `LLM_FALLBACK_MODEL` | `google/gemini-2.5-flash-lite` (empty disables) | Second entry of OpenRouter `models` |
   | embeddings | (TypeScript `embed:rag`) | `openai/text-embedding-3-small` @ 768 dims | RAG index |
   | speech-to-text | (TypeScript practice audio) | `whisper-large-v3-turbo` | Spoken answers |

3. **Only when required.** Every job runs its heuristic first and skips the model when the
   heuristic result passes validators at or above the auto-approve bar (0.8):
   - taxonomy: skip when the topic/domain proposals are already auto-approved (difficulty-only
     gaps never call the model — an LLM difficulty guess is capped below the bar);
   - rubrics: skip when the extractive rubric validates and has ≥ 2 cued key points (STAR
     templates always skip); answers whose own calculation fails recompute skip too (no draft
     could validate);
   - expansions: the deterministic topic handler covers known topics; `expand-v1` runs only for
     `generic` topics;
   - signal tags: the model sees only signals the keyword rules left `untagged`.

   The small tier handles the remainder; the primary tier is tried only when the small draft
   fails validation (schema, unknown topic slug, weights, grounding). Network / auth failures
   do not escalate — they fall back to the heuristic. Counts
   (`heuristic` / `small` / `primary` / `failed`) are reported in
   `reports/answer-enrichment-report.json` (`metrics.llm_routes`), `reports/run-summary.json`
   (`enrichment.llm_routes`, per stage) and CLI output.
4. **Provenance.** The stored enum value `gemini_synthesised` is kept because it is part of the
   shared TypeScript `ProvenanceEnum` (`packages/contracts/src/enums.ts`) and existing Neon rows;
   it now means "LLM-synthesised". Python code uses the alias `LLM_SYNTHESISED` (same member) and
   the readers accept `llm_synthesised`. The model id OpenRouter actually served is always
   recorded in `model_version` / `model`.
5. **CLI.** `ibpe run-pipeline --llm/--no-llm --tier small|primary --escalate/--no-escalate`;
   `python -m ibpe_corpus.answers.enrich_job --tier … --no-escalate`. Credentials check
   (`credentials_configured`) keys off `OPENROUTER_API_KEY` only.

## Rationale

- **Cost**: most items never reach a model (fixtures: ~1.3k items settled heuristically; with a
  key only ~120 taxonomy questions and ~45 thin rubrics qualify), and those that do go to a
  flash-class model first. The primary tier is paid for only on validation failure.
- **One key**: `OPENROUTER_API_KEY` replaces `GEMINI_API_KEY` + `AI_GATEWAY_API_KEY`; switching
  models is an env change, not a deploy.
- **Provider fallback**: OpenRouter's `models` list routes around a provider outage or rate
  limit without client code.

## Consequences

- `GEMINI_API_KEY` and `AI_GATEWAY_API_KEY` are **retired** for the Python worker; remove them
  from worker secrets once the TypeScript side (grader, embeddings) has also moved.
  `OPENROUTER_API_KEY` is server/worker-only — never `NEXT_PUBLIC_*`.
- **Re-embed RAG once** when `embed:rag` switches to `text-embedding-3-small` @ 768: vectors
  from different models are not comparable, so the whole `rag_documents` index must be rebuilt
  in one pass (not incrementally by content hash).
- `gemini_client.py` is deleted (no remaining importers); `llm_client.py` is the API.
- Rubric behaviour change with a key: validated heuristic rubrics are no longer replaced by LLM
  rubrics; only thin or failing ones get a model draft.
- JSON-schema strict mode depends on the routed provider supporting structured outputs; a
  provider that ignores it still has its reply validated by Pydantic (failure → escalate).
