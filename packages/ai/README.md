# @ibpe/ai

Dependency-free **OpenRouter** client plus model tiers for the TypeScript stack,
and the enrichment proposal schemas. See `docs/deployment/llm-stack.md`.

- `src/models.ts` — tiers from env: `LLM_PRIMARY_MODEL` (Jev; placeholder
  default), `LLM_SMALL_MODEL`, `LLM_EMBED_MODEL` (768-d), `LLM_STT_MODEL`;
  `isLlmConfigured()` = `OPENROUTER_API_KEY` present.
- `src/openrouter.ts` — `chat`, `chatJson` (zod → strict `json_schema`,
  validated reply), `embed`, `transcribe`; typed `OpenRouterError` with HTTP
  status; `fetch`/`env` injectable for tests. The key is never logged.
- `src/embeddings.ts` — `embedText(s)`, `cosineSimilarity`, `toPgVectorLiteral`.
- `src/grade.ts` — `gradeModelConfig()` for the rubric judge (primary tier,
  small fallback, `route: "openrouter"`).

```bash
npm test -w @ibpe/ai    # mocked-fetch client tests
```

Enrichment outputs keep the stored provenance value `gemini_synthesised`
(a data enum, not a statement about the model) — never Glassdoor or GitHub.
The Python enrich job (`python -m ibpe_corpus.answers.enrich_job`) has its own
model configuration.
