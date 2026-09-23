# apps/worker

Scrape / transform / enrich workers. Infra scaffolds deploy; job logic owned by glassdoor / data-quality / answers.

**Hard rule:** never run long Glassdoor crawls inside Vercel serverless **request** timeouts. Prefer Cloud Agents / this image / host cron. GitHub Actions `worker-schedule.yml` is dispatch-only by default (no unattended crawl).

## Health (Wave 3)

```bash
# From repo root
docker build -t concord-worker -f apps/worker/Dockerfile .

# Import health (same as Dockerfile HEALTHCHECK) — no network scrape
docker run --rm concord-worker \
  python -c "from pathlib import Path; import ibpe_corpus; assert Path('scrapers').is_dir(); assert Path('main.py').is_file(); print('worker_health_ok')"

# Or on a host with editable install
source .venv/bin/activate
pip install -e .
python -c "from pathlib import Path; import ibpe_corpus; assert Path('scrapers').is_dir(); print('worker_health_ok')"
```

Schedule success = job exit code 0. See `docs/deployment/workers.md` and `docs/deployment/monitoring.md`.

## LLM enrichment via OpenRouter (Workstream H, ADR 0007)

Runs **offline** (not on browse request path). One key, two tiers:

| Tier | Env | Default | When |
|------|-----|---------|------|
| small | `LLM_SMALL_MODEL` | `deepseek/deepseek-v4-flash` | Default for taxonomy, rubric drafts, expansion proposals, signal tags |
| primary ("Jev") | `LLM_PRIMARY_MODEL` | `deepseek/deepseek-v4.1-flash` (placeholder) | `--tier primary`, or a small draft that failed validation once |

Alternatives for the small tier: `z-ai/glm-4.5-air`, `google/gemini-2.5-flash-lite`.
`LLM_FALLBACK_MODEL` is sent as the second entry of OpenRouter's `models` list.

```bash
source .venv/bin/activate
# Heuristic dry-run (no API key)
python -m ibpe_corpus.answers.enrich_job --dry-run --limit 20

# Live model (Cloud Agents Secrets / .env)
# OPENROUTER_API_KEY=...
python -m ibpe_corpus.answers.enrich_job --limit 50                 # small tier, escalates on validation failure
python -m ibpe_corpus.answers.enrich_job --limit 50 --tier primary  # Jev directly
python -m ibpe_corpus.answers.enrich_job --limit 50 --no-escalate   # never touch primary
```

"Only when required": heuristics run first; the model is called only for items the heuristic
cannot auto-approve. Report: `reports/answer-enrichment-report.json` — `metrics.llm_routes`
counts `heuristic` / `small` / `primary` / `failed`, `models_used` lists the OpenRouter model ids
actually served, `llm_usage` carries tokens and cost.

Durable proposals (plan P2.1): pass `--db data/db/corpus.db` to persist enrich-v1 proposals and the
editorial queue in SQLite; `ibpe proposals` lists them and `ibpe review-proposal <id> approved --reviewer …`
records a human decision that survives re-runs. Taxonomy / rubric enrichment also runs inside
`ibpe run-pipeline` (heuristic without a key; `--llm` enables OpenRouter when `OPENROUTER_API_KEY` is set;
`--tier primary` / `--no-escalate` pick tiers). Route counts land in `reports/run-summary.json` → `enrichment.llm_routes`.

Provenance: all LLM outputs keep the stored label `gemini_synthesised` (frozen by the shared TS
`ProvenanceEnum`; it means "LLM-synthesised") with the real OpenRouter model id in `model_version` / `model` —
never Glassdoor / GitHub teaching source.

## Secrets

Copy names from `.env.worker.example`. Keep Glassdoor / proxy / session files off Vercel `NEXT_PUBLIC_*`. Product env inventory: `docs/agent-run/env-inventory.md`.
