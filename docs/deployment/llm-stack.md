# LLM stack (OpenRouter)

The web app, `embed:rag` and the grader eval call **OpenRouter** through a
dependency-free client in `packages/ai/src/openrouter.ts`. Gemini (`@ai-sdk/google`,
`GEMINI_API_KEY`) is no longer used by the TypeScript stack.

## Owner action: set Jev's slug

Jev is not in OpenRouter's public catalog (checked 2026-09-23), so the primary
model is a pure env setting:

```bash
# Vercel (server-only) + local .env
OPENROUTER_API_KEY=sk-or-...
LLM_PRIMARY_MODEL=<jev's OpenRouter slug>   # until set, the placeholder deepseek/deepseek-v4.1-flash is used
```

Then run the grader eval against it (`npm run eval:grader -w @ibpe/web`) and
record the result in `docs/decision-log.md`.

## Tiers

| Tier | Env var | Default | Used by | Price (per 1M tokens, in / out) |
|------|---------|---------|---------|------|
| primary | `LLM_PRIMARY_MODEL` | `deepseek/deepseek-v4.1-flash` (**placeholder for Jev**) | Rubric grading judge — only when the grade router needs it | Jev: owner to confirm |
| small | `LLM_SMALL_MODEL` | `deepseek/deepseek-v4-flash` | RAG session brief, simulator coaching; automatic fallback for primary | $0.082 / $0.165 |
| small (alt) | — | `z-ai/glm-4.7-flash` | drop-in alternative | $0.061 / $0.40 |
| small (alt) | — | `google/gemini-2.5-flash-lite` | drop-in alternative (Gemini via OpenRouter) | $0.10 / $0.40 |
| embed | `LLM_EMBED_MODEL` | `openai/text-embedding-3-small` @ 768 dims | RAG embeddings (`embed:rag`, query embeddings) | $0.02 input |
| stt | `LLM_STT_MODEL` | `openai/whisper-large-v3-turbo` | Voice-answer transcription (`/api/transcribe`) | billed per second of audio |

Prices are OpenRouter list prices on 2026-09-23; check the model pages before
relying on them.

Other settings:

| Env var | Default | Notes |
|---------|---------|-------|
| `OPENROUTER_API_KEY` | — | Required. **Server-only** — never a `NEXT_PUBLIC_*` var; never logged (the client redacts it from error messages). |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Override for a proxy / mock. |
| `OPENROUTER_APP_URL` | `NEXT_PUBLIC_APP_URL` | Sent as `HTTP-Referer`; `X-Title: Concord` is always sent. |
| `GRADER_MODEL` | — | Legacy bake-off override for the primary tier. Only honoured when it is an OpenRouter slug (`vendor/model`); old bare Gemini ids are ignored. |

## How calls are made

- **Structured grading** — `chatJson(zodSchema, …)` sends
  `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`
  (zod → JSON Schema via `zod-to-json-schema`, OpenAI strict target), restates
  the schema in the system prompt for providers that ignore `response_format`,
  strips ```` ```json ```` fences and validates the reply with zod.
- **Fallback** — the primary tier sends `models: [primary, small]`, so
  OpenRouter retries on the small model when the primary errors. The model that
  actually answered is logged (`[grade] {..., model, cost}`).
- **Cost accounting** — every chat sends `usage: { include: true }`; token
  counts and USD cost are logged per grade.
- **Embeddings** — `POST /embeddings { model, input, dimensions: 768 }`; a
  vector of the wrong length is rejected (the pgvector column is 768-d).
- **Transcription** — `POST /audio/transcriptions { model, input_audio: { data, format }, language }`.
  The recorder produces webm/opus and we send `format: "webm"`; if the routed
  provider rejects webm the route answers 502 and the learner types instead.
  Whisper-class models drop filler words more often than the old Gemini
  prompt, so delivery filler counts may read lower.

## "Very small LLM only when required" — the grade router

`apps/web/lib/grading/router.ts` decides per attempt whether an LLM call is
needed at all. No call for: empty answers, reveal-copies, cache hits, flagged
injections, numeric-only rubrics, keyword-list / repetition answers (the shape
cap already keeps them below the pass mark), and decisive deterministic
pre-grades (every must-have's cues hit, no stuffing guard, score ≥ 0.9; or zero
cue hits and a short / off-topic answer). Everything else goes to the primary
tier. The decision is stored as `grade_json.router = { llm, reason, model }`.

On the 100-case eval set (2026-09-23) the router sends **48%** of cases to the
LLM; the 52 it skips are graded by the deterministic path with **100%**
correct-accuracy (target ≥ 95%). See `apps/web/evals/grader/README.md`.

## Degradation without a key

| Surface | Without `OPENROUTER_API_KEY` |
|---------|------------------------------|
| Grading | deterministic rubric / overlap grade (`score_source: deterministic`) |
| RAG brief | template brief |
| Simulator coaching | deterministic summary |
| Voice transcription | `501 transcription_unavailable` |
| RAG search | lexical fallback |
| `embed:rag` | exits with an error (use `--dry-run` to count docs) |

## Switching the embedding model

`rag_documents.content_hash` includes the embedding model id, and dense search
only uses rows whose `model_id` matches `LLM_EMBED_MODEL`. After changing the
model (including this Gemini → OpenRouter migration) re-run:

```bash
npm run embed:rag -w @ibpe/database -- --dry-run   # shows pending docs + model
npm run embed:rag -w @ibpe/database
```

Until it has run, RAG search falls back to lexical ranking.
