# @ibpe/ai

Dependency-free **OpenRouter** client plus model tiers for the TypeScript stack,
and the enrichment proposal schemas. See `docs/deployment/llm-stack.md`.

- `src/models.ts` — tiers from env: `LLM_DECISION_MODEL` (Jev,
  default `typesafe/jev-1.13`), `LLM_SMALL_MODEL` (the only generative chat
  model), `LLM_EMBED_MODEL` (768-d), `LLM_STT_MODEL`; thresholds
  `JEV_CONFIDENCE_FLOOR` (0.6) / `JEV_ACCEPT_CONFIDENCE` (0.8);
  `isLlmConfigured()` = `OPENROUTER_API_KEY` present. `GRADER_MODEL` overrides
  the decision model only when it is a Jev id.
- `src/decisions.ts` — `decide({ state, questions, model?, signal })`: typed
  client for the Decisions API (`POST /api/alpha/decisions`, outside
  `/api/v1`; `OPENROUTER_DECISIONS_URL` overrides). `noul` / `choice` /
  `score` question and answer unions, answers validated against the questions
  (missing confidence → 0), typed errors, `usage.cost` passthrough.
- `src/cascade.ts` — `verifyDraft({ sources, request, draft })`: one Jev
  `choice` (supported / unsupported / declined) for the draft-then-verify
  cascade; `accepted` = supported ∧ confidence ≥ `JEV_ACCEPT_CONFIDENCE`.
- `src/openrouter.ts` — `chat`, `chatJson` (zod → strict `json_schema`,
  validated reply), `embed`, `transcribe`; typed `OpenRouterError` with HTTP
  status; `fetch`/`env` injectable for tests. The key is never logged.
- `src/embeddings.ts` — `embedText(s)`, `cosineSimilarity`, `toPgVectorLiteral`.
- `src/grade.ts` — `gradeModelConfig()` for the grader (Jev decision model,
  small chat model for escalation, confidence floor, `route: "openrouter"`).

```bash
npm test -w @ibpe/ai    # mocked-fetch client tests
```

Enrichment outputs keep the stored provenance value `gemini_synthesised`
(a data enum, not a statement about the model) — never Glassdoor or GitHub.
The Python enrich job (`python -m ibpe_corpus.answers.enrich_job`) has its own
model configuration.
