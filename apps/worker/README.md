# apps/worker

Scrape / transform / enrich workers. Infra scaffolds deploy; job logic owned by glassdoor / data-quality / answers.

## Gemini enrichment (Workstream H)

Runs **offline** (not on browse request path):

```bash
source .venv/bin/activate
# Heuristic dry-run (no API key)
python -m ibpe_corpus.answers.enrich_job --dry-run --limit 20

# Live model (Cloud Agents Secrets / .env)
# GEMINI_API_KEY=...  or AI_GATEWAY_API_KEY=...
python -m ibpe_corpus.answers.enrich_job --limit 50
```

Report: `reports/answer-enrichment-report.json`

Provenance: all Gemini outputs are `gemini_synthesised` — never Glassdoor / GitHub teaching source.
