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

Runs **offline** (not on browse request path). One key, two model roles:

| Role | Env | Default | When |
|------|-----|---------|------|
| decision (Jev) | `LLM_DECISION_MODEL` | `typesafe/jev-1.13` | Taxonomy, signal topic tags, concept / mode routing, and verifying every small-model draft (`POST /api/alpha/decisions`, input tokens only) |
| small | `LLM_SMALL_MODEL` | `deepseek/deepseek-v4-flash` | Only text: thin rubric drafts, generic expansion appendices, `--llm` diagram drafts |

Thresholds: `JEV_AUTO_APPROVE` (0.8; taxonomy auto-approve with rule agreement, 0.9 alone) and
`JEV_ACCEPT_CONFIDENCE` (0.8; minimum `supported` confidence for a small-model draft).
Alternatives for the small tier: `z-ai/glm-4.5-air`, `google/gemini-2.5-flash-lite`.
`LLM_FALLBACK_MODEL` is sent as the second entry of the small tier's OpenRouter `models` list.

```bash
source .venv/bin/activate
# Heuristic dry-run (no API key)
python -m ibpe_corpus.answers.enrich_job --dry-run --limit 20

# Live model (Cloud Agents Secrets / .env)
# OPENROUTER_API_KEY=...
python -m ibpe_corpus.answers.enrich_job --limit 50                 # Jev classification (concept / mode / track / difficulty)
python -m ibpe_corpus.answers.enrich_job --limit 50 --llm           # + small-model diagram drafts, Jev-verified
python -m ibpe_corpus.answers.enrich_job --limit 50 --llm --no-escalate   # no retry after a rejected draft
```

"Only when required": heuristics run first; a model is called only for items the heuristic
cannot auto-approve. Report: `reports/answer-enrichment-report.json` — `metrics.llm_routes`
counts `heuristic` / `jev` / `small` / `failed`, `metrics.diagram_routes` the `--llm` diagram
drafts, `models_used` lists the model ids actually served, `llm_usage.jev` / `llm_usage.small`
carry tokens and cost.

Durable proposals (plan P2.1): pass `--db data/db/corpus.db` to persist graph-enrichment proposals and the
editorial queue in SQLite; `ibpe proposals` lists them and `ibpe review-proposal <id> approved --reviewer …`
records a human decision that survives re-runs. Taxonomy / rubric enrichment also runs inside
`ibpe run-pipeline` (heuristic without a key; `--llm` enables OpenRouter when `OPENROUTER_API_KEY` is set;
`--no-escalate` disables the one small-model retry). Route counts land in `reports/run-summary.json` → `enrichment.llm_routes`.

Provenance: all LLM outputs keep the stored label `gemini_synthesised` (frozen by the shared TS
`ProvenanceEnum`; it means "LLM-synthesised") with the real OpenRouter model id in `model_version` / `model` —
never Glassdoor / GitHub teaching source.

## Secrets

Copy names from `.env.worker.example`. Keep Glassdoor / proxy / session files off Vercel `NEXT_PUBLIC_*`. Product env inventory: `docs/agent-run/env-inventory.md`.
