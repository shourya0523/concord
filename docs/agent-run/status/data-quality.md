# Status: data-quality

State: done
Wave: 1
Updated: 2026-07-30
Branch: `local/ws-data-quality-a9ff`

## Exit criteria (Wave 1)

| Criterion | Status |
|-----------|--------|
| GitHub import path wired to contracts provenance | done |
| License-review notes before production publish | done (`reports/license-review.md`) |
| Quality reports updated (teaching vs firm signals) | done |
| Bank bridge = firm signals only | done |
| Never publish `[Interview process]` placeholders | done |
| Dedup beyond SHA1; merges reversible | done (teaching fuzzy + reversible audits) |

## Latest pipeline snapshot (fixture + staged GitHub + bank signals)

- Publishable teaching questions: **416**
- Firm-signal topic clusters: **3483**
- Firm-signal joins onto teaching Qs: **738**
- Placeholders in published `questions.jsonl`: **0**
- License gate: **BLOCKING** (see `reports/license-review.md`)

## Notes

- **Teaching truth:** `GitHubSourceAdapter` (high/medium/low) + static seed → `product_role=teaching_qa`, `contract_provenance=github_source|static_seed`.
- **Firm signals:** `question_bank.json` + Glassdoor fixtures → `TOPIC_SIGNAL` (`glassdoor_occurrence`); joined via `join_firm_signals` (fuzzy 88, reversible audits). Never teaching answers.
- **Publish gate:** `canonical/publish_gate.py` strips `[Interview process]` placeholders; `questions.jsonl` = teaching only; `firm_signals.jsonl` = withheld topic clusters.
- **Dedup:** teaching corpus always fuzzy (`token_set_ratio` + concept guard); bank-scale signals exact-hash only. Split canonicalise so bank volume does not disable teaching fuzzy merges.
- **Importers:** firebase JSON, HTML playbook, markdown numbered lists, markdown table titles (offergenie).
- **License gate:** production publish **BLOCKING** until high-priority GitHub sources cleared in `reports/license-review.md`.
- Gemini enrich left to Workstream H; no UI / scraper changes.

## Owned paths touched

- `src/ibpe_corpus/adapters/github/**`, `adapters/static/**`, `adapters/glassdoor/question_bank.py` (signal bridge)
- `src/ibpe_corpus/canonical/{publish_gate,firm_signals}.py`
- `src/ibpe_corpus/orchestration/pipeline.py`, `export/exporters.py`
- `config/github_sources.yml`
- `exports/`, `reports/*quality*`, `reports/license-review.md`, `reports/duplicate-report.md`
- `docs/agent-run/status/data-quality.md` (this file)
