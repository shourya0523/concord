# LLM stack (OpenRouter)

The web app, `embed:rag` and the grader eval call **OpenRouter** through a
dependency-free client in `packages/ai/src/` (`openrouter.ts` for chat /
embeddings / transcription, `decisions.ts` for Jev). Gemini (`@ai-sdk/google`,
`GEMINI_API_KEY`) is no longer used by the TypeScript stack.

The stack is cost-optimised around **Jev**, OpenRouter's typed decision model
(`typesafe/jev-1.13`, TypeSafe — vendor docs in `docs/vendor/jev/`), plus a
**very small chat model only when a decision is unsure or text must be
written**. Decision log: "Grader = Jev decisions + small-LLM escalation".

```bash
# Vercel (server-only) + local .env — the only required secret
OPENROUTER_API_KEY=sk-or-...
# everything else has a default (see below)
```

## Tiers

| Tier | Env var | Default | Used by | Price |
|------|---------|---------|---------|-------|
| decision | `LLM_DECISION_MODEL` | `typesafe/jev-1.13` (Jev, pinned — `~typesafe/jev-latest` tracks new releases) | Grading (one typed request per graded attempt); verifying brief / coaching drafts | **$0.042 / 1M input tokens; output free** (`usage.cost` returned per call) |
| small | `LLM_SMALL_MODEL` | `deepseek/deepseek-v4-flash` | The **only generative chat model**: RAG brief + coaching drafts, grader escalation | $0.082 / $0.165 per 1M in / out |
| small (alt) | — | `z-ai/glm-4.7-flash` | drop-in alternative | $0.061 / $0.40 |
| small (alt) | — | `google/gemini-2.5-flash-lite` | drop-in alternative (Gemini via OpenRouter) | $0.10 / $0.40 |
| embed | `LLM_EMBED_MODEL` | `openai/text-embedding-3-small` @ 768 dims | RAG embeddings (`embed:rag`, query embeddings) | $0.02 / 1M input |
| stt | `LLM_STT_MODEL` | `openai/whisper-large-v3-turbo` | Voice-answer transcription (`/api/transcribe`) | billed per second of audio |

Prices are OpenRouter list prices on 2026-09-23 (Jev: model page / cookbook);
check the model pages before relying on them. A Jev grade is ~500–1,500 input
tokens ≈ **$0.00002–0.00006**; a small-model rubric-judge escalation is
~1,500 in / ~300 out ≈ $0.0002.

Jev is **not an LLM**: it answers typed questions about a `state` object with
probabilities (no text, no reasoning), all questions in one request are
answered in parallel and cannot see each other.

Other settings:

| Env var | Default | Notes |
|---------|---------|-------|
| `OPENROUTER_API_KEY` | — | Required. **Server-only** — never a `NEXT_PUBLIC_*` var; never logged (the client redacts it from error messages). |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Chat / embeddings / STT base. Override for a proxy / mock. |
| `OPENROUTER_DECISIONS_URL` | origin of `OPENROUTER_BASE_URL` + `/api/alpha/decisions` | The Decisions API lives **outside** `/api/v1`. |
| `JEV_CONFIDENCE_FLOOR` | `0.6` | Grader: escalate to the small model when a must-have key point's (or the no-rubric score's) Jev confidence is below this. |
| `JEV_ACCEPT_CONFIDENCE` | `0.8` | Cascade: ship a small-model draft only when Jev says `supported` at or above this. |
| `OPENROUTER_APP_URL` | `NEXT_PUBLIC_APP_URL` | Sent as `HTTP-Referer`; `X-Title: Concord` is always sent. |
| `GRADER_MODEL` | — | Legacy override: honoured only when it is a Jev id (e.g. `typesafe/jev-1.12`, for version bake-offs); anything else is ignored with a one-time warning. |

`LLM_PRIMARY_MODEL` is gone from the TypeScript stack (the placeholder chat
"primary" tier was replaced by the decision tier). The Python enrich worker
keeps its own tier variables — `apps/worker/.env.worker.example`.

## Grading flow

```
typed answer
  │
  ├─ router skip (no model): empty · reveal-copy · cache hit · injection regex
  │    · numeric-only rubric · keyword-list / repetition · decisive pass / fail
  │      → deterministic grade                        router.path = "skip"
  │
  ├─ no OPENROUTER_API_KEY / rate-limited
  │      → deterministic grade                        router.path = "deterministic"
  │
  └─ ONE Jev request  POST /api/alpha/decisions
       state     { interview_question, teaching_answer (concise + ≤1200 chars expanded),
                   candidate_answer }
       rubric    kp_<id>  choice  hit | partial | miss   per key point
                 rf_<n>   noul    "commits this mistake?" per red flag   (≥ 0.7 → triggered)
                 instructs_grader  noul                                   (≥ 0.7 → injection:
                                                                            cap 0.3, red flag, correct=false)
       no rubric quality  score over [incorrect, partially, mostly, fully correct] → position / 3
       → score + correct by the existing rubric.ts formulas; feedback + follow-up
         templated from the verdicts (no LLM)          score_source "jev", router.path = "jev"
       │
       └─ escalate ONLY when a must-have's confidence < JEV_CONFIDENCE_FLOOR,
          the no-rubric score confidence < floor, or Jev errors / times out
            → SMALL model, rubric-judge prompt (evidence quotes verified in code)
                                                       score_source "llm", router.path = "jev+small"
            → chat fails too: keep the low-confidence Jev grade, or deterministic
              after a Jev error
```

Every grade stores `grade_json.router = { path, reason, escalation,
decision_model, chat_model, cost_usd }` and logs `[grade] {…path, cost,
decision_model, chat_model}`. Jev items carry `confidence` (0–1) and
`evidence: null` (`RubricItemResultSchema`); migration 062 allows
`score_source = 'jev'`.

**Rate limit.** One per-user hourly budget of 600 units: a Jev call costs 1
unit, a small-model escalation 10 (the previous limit was 60 chat grades an
hour — that is still the chat ceiling; Jev grades get 10× the headroom).
Units are reserved per call, only when the router needs a model.

**Cache.** Key = question, rubric fingerprint, grader version,
`<decision>+<chat>@<floor>`, normalised answer; Jev and chat grades are cached
for 7 days.

## Jev-verified cascade (brief + coaching)

`apps/web/lib/data/rag-brief.ts` and `apps/web/lib/simulator/coach.ts`:

1. the SMALL model drafts (as before) and the citation guard keeps only cited
   sentences;
2. one Jev `choice` — `supported | unsupported | declined` — over
   `state = { sources, request, draft }`, where `sources` are the pack snippets
   / report facts + allowed citation ids the draft may use
   (`verifyDraft`, `packages/ai/src/cascade.ts`);
3. ship the draft only when `supported` with confidence ≥
   `JEV_ACCEPT_CONFIDENCE`; otherwise (or on any error) the existing
   deterministic cite-only template / summary. There is no frontier tier.

Responses carry `brief_verified` / `summary_verified` (true only for a
Jev-accepted draft).

## How calls are made

- **Decisions (Jev)** — `decide({ state, questions, model?, signal })`
  validates every answer against the questions sent (wrong type, unknown
  label, missing answer → `OpenRouterError("invalid_response")`); a missing
  confidence becomes 0 so it can never pass a threshold. HTTP 400 / 401 / 402 /
  403 / 404 / 413 / 429 / 529 map to typed codes (`bad_request`, `auth`,
  `insufficient_credits`, `not_found`, `payload_too_large`, `rate_limited`,
  `overloaded`); `usage.cost` is passed through.
- **Structured chat (escalation)** — `chatJson(zodSchema, …)` sends
  `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`
  (zod → JSON Schema via `zod-to-json-schema`, OpenAI strict target), restates
  the schema in the system prompt for providers that ignore `response_format`,
  strips ```` ```json ```` fences and validates the reply with zod.
- **Cost accounting** — every chat sends `usage: { include: true }`; Jev
  returns `usage.cost`. Both are summed into `grade_json.router.cost_usd`.
- **Embeddings** — `POST /embeddings { model, input, dimensions: 768 }`; a
  vector of the wrong length is rejected (the pgvector column is 768-d).
- **Transcription** — `POST /audio/transcriptions { model, input_audio: { data, format }, language }`.
  The recorder produces webm/opus and we send `format: "webm"`; if the routed
  provider rejects webm the route answers 502 and the learner types instead.
  Whisper-class models drop filler words more often than the old Gemini
  prompt, so delivery filler counts may read lower.

## The grade router ("models only when required")

`apps/web/lib/grading/router.ts` decides per attempt whether any model call is
needed. No call for: empty answers, reveal-copies, cache hits, flagged
injections, numeric-only rubrics, keyword-list / repetition answers (the shape
cap already keeps them below the pass mark), and decisive deterministic
pre-grades (every must-have's cues hit, no stuffing guard, score ≥ 0.9; or zero
cue hits and a short / off-topic answer). Everything else goes to Jev.

On the 100-case eval set (2026-09-23) the router sends **48%** of cases to a
model; the 52 it skips are graded by the deterministic path with **100%**
correct-accuracy (target ≥ 95%). Measure Jev itself with
`npm run eval:grader -w @ibpe/web -- --jev` (needs the key) — see
`apps/web/evals/grader/README.md`.

## Degradation without a key

| Surface | Without `OPENROUTER_API_KEY` |
|---------|------------------------------|
| Grading | deterministic rubric / overlap grade (`score_source: deterministic`) — identical to before Jev |
| RAG brief | template brief (`brief_verified: false`) |
| Simulator coaching | deterministic summary (`summary_verified: false`) |
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
