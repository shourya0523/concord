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
