# IB/PE Interview Corpus Pipeline

Automated collection, extraction, answering, normalisation, and validation of
investment-banking and private-equity interview questions.

## Status

- **Greenfield repo** at mission start (blank README). Built fixture-first because
  live Glassdoor returns Cloudflare/CAPTCHA HTTP 403 in this environment.
- Glassdoor parsers, pagination, question-detail and response extraction work against
  synthetic fixtures and blocked-page classifiers.
- PE taxonomy + classifier + 64-employer target matrix.
- GitHub seed import (Capital Markets QB 385 Q&A) + bundled offline seed.
- Layered answers: source → corpus match → deterministic synthesis → validation.
- Restartable job runner with idempotency keys and exports/reports.

## Install

```bash
python3 -m pip install -e ".[dev]"
```

## Migrate / init DB

```bash
ibpe migrate
# or: python -c "from ibpe_corpus.storage import CorpusStore; CorpusStore('data/db/corpus.db')"
```

SQL mirror: `migrations/001_init.sql`.

## Fixture-only end-to-end run (no live Glassdoor)

```bash
ibpe run-pipeline --mode fixtures --force
pytest -q
```

## Common commands

| Task | Command |
|------|---------|
| Replay archived HTML | `ibpe replay-fixture fixtures/glassdoor/html/synthetic-question-detail-qtn.html` |
| Occupation URL fetch (expect block) | `ibpe fetch-glassdoor --role "Private Equity Associate"` |
| PE search phrases | `ibpe pe-phrases --limit 30` |
| Classify role | `ibpe classify-role "Private Equity Associate"` |
| Import seed | `ibpe import-seed` |
| Import GitHub high-priority | `ibpe import-github --priority high` |
| Inspect dead letters | `ibpe inspect-dead-letters` |

## Layout

```
src/ibpe_corpus/
  adapters/glassdoor|github|static
  answers/  pe/  canonical/  orchestration/  export/  storage/  schemas/
config/   fixtures/   docs/   exports/   reports/   migrations/   tests/
```

## Docs

See `docs/architecture.md`, `docs/operations.md`, `docs/troubleshooting.md`,
and workstream docs under `docs/`.

## Honest limitations

Live Glassdoor application HTML was not reachable here. Coverage targets that
depend on live employer crawls are measured from the PE matrix + imported corpora
and documented shortfalls in `reports/`.
