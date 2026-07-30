# Status: data-quality

State: in_progress
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
| Dedup beyond SHA1; merges reversible | done (existing + firm-signal join audits) |

## Latest pipeline snapshot (fixture + staged GitHub + bank signals)

- Publishable teaching questions: **431**
- Firm-signal topic clusters: **3483**
- Firm-signal joins onto teaching Qs: **168**
- Placeholders in published `questions.jsonl`: **0**
- License gate: **BLOCKING** (see `reports/license-review.md`)

## Notes

- **Teaching truth:** GitHub adapters (`GitHubSourceAdapter` high/medium/low) + static seed → `product_role=teaching_qa`, `contract_provenance=github_source|static_seed`.
- **Firm signals:** `question_bank.json` + Glassdoor fixtures import as `TOPIC_SIGNAL` (`glassdoor_occurrence`); joined onto teaching canonicals via `join_firm_signals` (reversible audits).
- **Publish gate:** `canonical/publish_gate.py` strips `[Interview process]` placeholders; exports `questions.jsonl` = teaching only; `firm_signals.jsonl` = withheld topic clusters.
- **License gate:** production publish blocked until high-priority GitHub sources cleared in `reports/license-review.md`.
- PR #2 corpus on main extended (not re-imported from scratch); config annotated with `product_role` / `license_status`.
- Gemini enrich left to Workstream H (`ibpe-answers`); no UI work.

## Owned paths touched

- `src/ibpe_corpus/adapters/github/**`, `adapters/static/**`, `adapters/glassdoor/question_bank.py` (signal bridge)
- `src/ibpe_corpus/canonical/{publish_gate,firm_signals}.py`, `__init__.py`
- `src/ibpe_corpus/orchestration/pipeline.py`, `export/exporters.py`
- `config/github_sources.yml`
- `exports/` (via pipeline), `reports/*quality*`, `reports/license-review.md`, `reports/duplicate-report.md`
- `docs/agent-run/status/data-quality.md` (this file)
