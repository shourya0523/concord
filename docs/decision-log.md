# Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-27 | Python 3.11+ / SQLite | Zero-ops reproducible local corpus |
| 2026-07-27 | Fixture-first Glassdoor | Live fetches return Cloudflare 403 |
| 2026-07-27 | No CAPTCHA circumvention | Mission non-negotiable |
| 2026-07-27 | Deterministic answer templates | Offline validation without LLM dependency |
| 2026-07-27 | Additive config YAML fragments | Parallel workstream ownership |
| 2026-07-27 | Hash-stable canonical IDs on re-run | Idempotent DB growth |
| 2026-09-23 | Grader model: keep `DEFAULT_GRADE_MODEL` (Gemini flash) until the P3.7 bake-off; **pending** | Decide on data, not guess: run `npm run eval:grader --workspace=@ibpe/web` once per candidate with `GRADER_MODEL=<id>` (bare Gemini id, or `provider/model` via AI Gateway), compare MAE / Spearman / correct accuracy / injection resistance / p95 latency × cost (see `apps/web/evals/grader/README.md`). The requested "Jev" model is unidentified — plug its id into `GRADER_MODEL` to include it. Record the winner here. |
| 2026-09-23 | **Grader = Jev decisions + small-LLM escalation** (supersedes the pending grader-model row above) | Cost-optimised stack: after the grade router's no-model skips, each attempt makes ONE request to Jev (`typesafe/jev-1.13` on OpenRouter's Decisions API, $0.042 / 1M input tokens, output free) — a hit / partial / miss choice per rubric key point, a noul per red flag and `instructs_grader`; code scores the verdicts with the existing rubric formulas and templates feedback (`score_source = jev`, migration 062). The small chat model (`LLM_SMALL_MODEL`, default `deepseek/deepseek-v4-flash`) runs the rubric-judge prompt only when a must-have's Jev confidence < `JEV_CONFIDENCE_FLOOR` (0.6), the no-rubric score confidence < floor, or Jev errors. Briefs and simulator coaching use a Jev-verified cascade (ship the small-model draft only if `supported` ≥ `JEV_ACCEPT_CONFIDENCE` 0.8, else the deterministic template). The placeholder chat "primary" tier and `LLM_PRIMARY_MODEL` are removed from the TS stack. Accuracy to be confirmed with `npm run eval:grader -w @ibpe/web -- --jev` once `OPENROUTER_API_KEY` is available. |
