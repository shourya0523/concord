# IB/PE Interview Corpus Pipeline

Automated collection, extraction, answering, normalisation, and validation of
investment-banking and private-equity interview questions.

This repo also retains the imported **GlassCleaner2** Selenium scraper (`main.py`)
for live Glassdoor batch collection when credentials and browser access are
available. See [Legacy scraper](#legacy-glasscleaner-scraper) below.

## Status

- **Corpus pipeline** (`ibpe`): fixture-first because live Glassdoor often returns
  Cloudflare/CAPTCHA HTTP 403 in restricted environments.
- Glassdoor parsers, pagination, question-detail and response extraction work against
  synthetic fixtures and blocked-page classifiers.
- PE taxonomy + classifier + 64-employer target matrix.
- GitHub seed import (Capital Markets QB 385 Q&A) + bundled offline seed.
- Layered answers: source → corpus match → deterministic synthesis → validation.
- Restartable job runner with idempotency keys and exports/reports.

## Install (corpus pipeline)

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

## Common commands (`ibpe`)

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
src/ibpe_corpus/          # corpus pipeline
  adapters/glassdoor|github|static
  answers/  pe/  canonical/  orchestration/  export/  storage/  schemas/
main.py scrapers/ web/    # legacy GlassCleaner scraper + UI
config/   fixtures/   docs/   exports/   reports/   migrations/   tests/
```

## Docs

See `docs/architecture.md`, `docs/operations.md`, `docs/troubleshooting.md`,
and workstream docs under `docs/`. Cloud agent setup: [`AGENTS.md`](AGENTS.md).

## Honest limitations

Live Glassdoor application HTML was not reachable in the fixture-first research
environment. Coverage targets that depend on live employer crawls are measured
from the PE matrix + imported corpora and documented shortfalls in `reports/`.

---

## Legacy GlassCleaner scraper

> Imported from [GlassCleaner2](https://github.com/sbalsara05/GlassCleaner2).
> Uses Selenium + optional `.env` login; writes to `data/question_bank.json`.

### Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set GLASSDOOR_EMAIL / GLASSDOOR_PASSWORD
```

### Batch scrape (IB / PE tracks)

```bash
python main.py batch --track PE --limit 5
python main.py batch --track IB
```

Flags: `--manual-login`, `--force`, `--sleep 5`, `--targets config/targets.json`.

### Single company

```bash
python main.py -c "Evercore" -p "Investment Banking Analyst" -e json
```

### Query / UI

```bash
python main.py query --track PE
python main.py ui   # http://127.0.0.1:5050
```

Cookie cache: `data/glassdoor_session.json` (gitignored). Do not commit credentials.
