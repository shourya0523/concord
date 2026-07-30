# Status: answers

State: in_progress
Wave: 1
Updated: 2026-07-30
Branch: `local/ws-answers-a9ff`

## Done

- Provenance guards (`answers/provenance.py`) — Gemini/editorial cannot be labelled Glassdoor / `source_provided` / GitHub-without-text
- Offline enrich job skeleton (`answers/enrich_job.py` + `gemini_client.py`) — Mode A/B graph wiring, dry-run heuristics when no `GEMINI_API_KEY`
- Deterministic finance calculators (`answers/calculators.py`) + fixtures under `fixtures/finance/`
- Validators call shared calculators; `enforce_answer_provenance` on validate
- Editorial review queue stub (`answers/editorial.py`)
- `@ibpe/ai` package stub (AI SDK / Gateway schema alignment)
- Reports: `reports/answer-coverage-report.md`, `reports/answer-enrichment-report.json` (via job)

## Next

- Live Gemini batch over imported GitHub corpus (needs key + durable worker wiring)
- Persist enrichment staging tables (coordinate with database workstream)
- Publish gates: schema + numeric validators before Mode A/B UI consume

## Stop criteria (Wave 1)

Enrich job skeleton + validators/fixtures landed; provenance enforced in code; status updated; branch pushed.
