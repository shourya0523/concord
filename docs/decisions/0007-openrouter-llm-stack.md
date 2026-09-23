# ADR 0007 — OpenRouter as the single model gateway: Jev decides, a small LLM writes

## Status

Accepted (2026-09-23). Revised 2026-09-23: **Jev is the decision tier**; the placeholder
"primary" chat tier is removed. Supersedes the Gemini / Vercel AI Gateway choice in ADR 0002
for *which* model enriches; ADR 0002's data thesis (GitHub = teaching truth, Glassdoor = firm
signals, LLM = synthesised enrichment) is unchanged.

## Context

Enrichment (taxonomy, rubric drafts, answer-expansion proposals, signal topic tags) called
Google Gemini directly (`GEMINI_API_KEY`) or via the Vercel AI Gateway (`AI_GATEWAY_API_KEY`):
two keys, one provider, no fallback, and a model call for every item even when the
deterministic heuristics already produced an auto-approvable result. Owner direction: a
cost-optimised stack — **Jev on OpenRouter and a very small LLM only when required**.

The first pass could not find "Jev" in the catalogue and shipped a placeholder chat "primary"
tier (`LLM_PRIMARY_MODEL`). Jev *is* on OpenRouter as `typesafe/jev-1.13` (TypeSafe), but it is
**not an LLM**: it is a System One *decision* model (`docs/vendor/jev/`). It takes a `state`
object plus typed questions and returns typed answers with probabilities — `noul` (p_yes),
`choice` (one label from a criteria map + `confidence` + `probabilities`) and `score` (position
on an ordered scale + `confidence`). It bills input tokens only (≈ $0.042 / M at the time of
writing; output is free) and answers every question in one request independently. It cannot
write text. That makes it the right tool for exactly the narrow "prompt-and-parse a label"
calls we were paying a chat model for, and the natural verifier for the few drafts that do
need text (OpenRouter cookbook: *Jev-verified cascade*).

## Decision

1. **Two OpenRouter surfaces, one key** (`OPENROUTER_API_KEY`, server/worker only):
   - **Jev — decisions** (`src/ibpe_corpus/answers/decisions_client.py`):
     `POST https://openrouter.ai/api/alpha/decisions` with `{model, state, questions}`. URL from
     `OPENROUTER_DECISIONS_URL`, else the origin of `OPENROUTER_BASE_URL` + `/api/alpha/decisions`
     (the Decisions API is outside `/api/v1`). Model `LLM_DECISION_MODEL` (default
     `typesafe/jev-1.13` — pin a version so tuned thresholds stay calibrated;
     `~typesafe/jev-latest` tracks releases). Answers are validated with Pydantic (asked type,
     known label); `usage.cost` is passed through and totalled per run.
   - **small — text** (`src/ibpe_corpus/answers/llm_client.py`):
     `POST {OPENROUTER_BASE_URL:-https://openrouter.ai/api/v1}/chat/completions` with strict
     `json_schema` structured output, `models: [$LLM_SMALL_MODEL, $LLM_FALLBACK_MODEL]` and
     `usage: {include: true}`.
   Both retry 429 / 5xx (incl. 529) / 408 / transport errors (and the transient in-flight-budget
   `402` for Decisions) with exponential backoff honouring `Retry-After`; errors are typed and
   never carry the key.
2. **Tiers** (all env-configurable):

   | Tier | Env | Default | Used for |
   |------|-----|---------|----------|
   | decision (Jev) | `LLM_DECISION_MODEL` | `typesafe/jev-1.13` | Taxonomy (topic / domain / difficulty / PE strategy), signal topic tags, `llm_enrich` concept + mode routing, and **verifying every small-model draft** |
   | small | `LLM_SMALL_MODEL` | `deepseek/deepseek-v4-flash` | Only outputs that need text (rubric drafts, expansion appendices, optional diagram drafts), only when the heuristic fails validation. Alternatives: `z-ai/glm-4.5-air`, `google/gemini-2.5-flash-lite` |
   | fallback | `LLM_FALLBACK_MODEL` | `google/gemini-2.5-flash-lite` (empty disables) | Second entry of the small tier's OpenRouter `models` |
   | embeddings | (TypeScript `embed:rag`) | `openai/text-embedding-3-small` @ 768 dims | RAG index |
   | speech-to-text | (TypeScript practice audio) | `whisper-large-v3-turbo` | Spoken answers |

   The placeholder chat "primary" tier, `LLM_PRIMARY_MODEL`, `LLM_DEFAULT_TIER` and the
   `--tier` flag are **removed** from the Python worker (the TypeScript grader has its own
   tiers — `docs/deployment/llm-stack.md`).
3. **Only when required.** Every job runs its heuristic first and makes **no network call**
   when the heuristic result passes validators at or above the auto-approve bar (0.8):
   - **Taxonomy** (`answers/taxonomy_enrich.py`): Jev is asked, in **one request per
     question**, only about the missing fields whose heuristic proposal is not auto-approved —
     `choice` topic over the migration 038 slugs (one short description each,
     `answers/jev_questions.py`), `choice` domain `ib|pe|both|other`, `score` difficulty
     `easy<medium<hard`, and `choice` PE strategy (`config/private_equity_taxonomy.yml`
     `strategy_roles` + `general`) riding along when the question looks PE. A Jev field is
     auto-approved when confidence ≥ `JEV_AUTO_APPROVE` (default 0.8) **and** it agrees with
     the keyword rules (rule topic / declared-or-mapped domain / heuristic difficulty /
     alias-matched strategy), or at confidence ≥ 0.9 alone; `other` never auto-approves.
     Everything else is a pending proposal for human review; the deterministic ~10% review
     sample of auto-approvals is unchanged. The small chat model is no longer used for taxonomy.
   - **Signal topic tags**: Jev tags only what the keyword rules left `untagged` (one request
     per batch of 10, one `choice` per signal); a tag is kept at ≥ `JEV_AUTO_APPROVE`.
   - **Rubrics / expansions** (need text): heuristic first; the small model drafts only when
     the heuristic fails validation or is below the bar (rubrics) / no topic handler exists
     (expansions). Each draft must pass the existing validators and then **Jev verification**
     against the source teaching answer — `choice` `supported | unsupported | declined`; only
     `supported` at ≥ `JEV_ACCEPT_CONFIDENCE` (default 0.8) is accepted. `declined` stops;
     otherwise `--escalate` (default on) retries **once with the small model**. Rejected
     drafts keep the heuristic rubric / leave the answer without an expansion proposal. No
     verifier → the small model is never called.
   - **`llm_enrich` graph job** (`answers/enrich_job.py`): classification fields come from one
     Jev request per question (concept `choice` over the migration 060 curriculum concept ids +
     `none`, learning-mode `choice`, track, difficulty, and topic when missing). Diagram drafts
     stay heuristic unless `--llm`, in which case the small model drafts and Jev verifies.

   Route counts per stage — `heuristic` / `jev` / `small` / `failed` (plus `jev_rejected`
   drafts) — are reported in `reports/run-summary.json` (`enrichment.llm_routes`,
   `enrichment.jev_rejected_drafts`), `reports/answer-enrichment-report.json`
   (`metrics.llm_routes`, `metrics.diagram_routes`) and CLI output.
4. **Provenance.** The stored enum value `gemini_synthesised` is kept because it is part of the
   shared TypeScript `ProvenanceEnum` (`packages/contracts/src/enums.ts`) and existing Neon rows;
   it now means "LLM-synthesised". Python code uses the alias `LLM_SYNTHESISED` (same member) and
   the readers accept `llm_synthesised`. The model id OpenRouter actually served (Jev snapshot
   or small model) is always recorded in `model_version` / `model`; Jev verdicts are stored with
   expansion proposals (`proposal_json.jev_verdict`) and taxonomy signals (`signals.jev`).
5. **CLI.** `ibpe run-pipeline --llm/--no-llm --escalate/--no-escalate`;
   `python -m ibpe_corpus.answers.enrich_job [--llm] [--no-escalate]`. Credentials check
   (`credentials_configured`) keys off `OPENROUTER_API_KEY` only.

## Rationale

- **Cost**: most items never leave the heuristic (fixtures: ~1.3k items settled with no network
  call). Classification that used to be a chat completion (prompt + output tokens) is now one
  Jev request per item billed on input tokens only (≈ 500 tokens ≈ $0.00002). The small model is
  paid only for the few thin rubrics / generic expansions, and a bad draft no longer escalates to
  a pricier model — Jev rejects it and the heuristic stands.
- **Safety**: every model-written string that could be auto-approved has been checked against
  the source teaching answer by a model whose output is a typed probability, not prose.
- **One key**; switching models is an env change, not a deploy; OpenRouter's `models` list
  routes the small tier around provider outages.

## Consequences

- `LLM_PRIMARY_MODEL` / `LLM_DEFAULT_TIER` are no longer read by the Python worker; new worker
  env: `LLM_DECISION_MODEL`, `JEV_AUTO_APPROVE`, `JEV_ACCEPT_CONFIDENCE` (optional
  `OPENROUTER_DECISIONS_URL`). Route-count keys changed from `small/primary` to `jev/small`.
- Thresholds (0.8 / 0.9) are the cookbook starting points, not tuned values: sample the pending
  queue and the `review_sample` items for a week, then raise `JEV_AUTO_APPROVE` /
  `JEV_ACCEPT_CONFIDENCE` if wrong approvals appear, or lower them if the queue is mostly right.
- `GEMINI_API_KEY` and `AI_GATEWAY_API_KEY` stay **retired** for the Python worker.
- **Re-embed RAG once** when `embed:rag` switches to `text-embedding-3-small` @ 768 (vectors
  from different models are not comparable).
- `publish-teaching.ts` applies only `topic` / `domain` / `difficulty` question proposals;
  approved `pe_strategy` proposals are applied to exported questions in Python but not yet
  published to Neon.
- The Decisions API is `alpha`; request/response shapes are validated strictly so a breaking
  change fails loudly (typed `DecisionResponseError`) and falls back to the heuristic.
