# @ibpe/ai (stub)

Shared AI SDK patterns for **offline Gemini enrichment** (Workstream H).

- Prefer Vercel AI Gateway model ids (`google/gemini-2.5-flash`, etc.).
- Use `generateText` + `Output.object({ schema })` (AI SDK v6) — never `generateObject`.
- Enrichment runs in workers / workflow steps, **not** on browse request paths.
- All outputs must carry `provenance: "gemini_synthesised"` — never Glassdoor or GitHub.

Python job: `python -m ibpe_corpus.answers.enrich_job`
Env: `GEMINI_API_KEY` and/or `AI_GATEWAY_API_KEY`.
