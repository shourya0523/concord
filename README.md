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
- Live scraper: BFF API / Patchright session / parallel batch collection into
  `data/question_bank.json`.

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
Autonomous build prompt: [`docs/prompts/autonomous-fullstack-build.md`](docs/prompts/autonomous-fullstack-build.md).

## Honest limitations

Bare httpx to Glassdoor is usually Cloudflare/CAPTCHA blocked from datacenter IPs.
Workarounds integrated in this repo (no credentials committed):

1. Import existing `data/question_bank.json` (legacy Selenium scrapes) — **default in pipeline**
2. Reuse `data/glassdoor_session.json` after a successful `main.py` login (`--mode session`)
3. SeleniumBase UC browser fetch (`--mode browser`) with optional `.env` credentials
4. BFF API backend (`--backend bff`) with residential `HTTPS_PROXY`
5. Patchright `storage_state` login (`python main.py login`)

```bash
ibpe fetch-status
ibpe import-question-bank
ibpe fetch-glassdoor --mode auto --role "Private Equity Associate"
```

Coverage targets that still need live employer crawls are documented in `reports/`.

---

## Legacy GlassCleaner scraper

> Imported from [GlassCleaner2](https://github.com/sbalsara05/GlassCleaner2).
> Uses Selenium + optional `.env` login; writes to `data/question_bank.json`.
> Cursor Cloud setup: see [`AGENTS.md`](AGENTS.md).

### Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set GLASSDOOR_EMAIL / GLASSDOOR_PASSWORD
```

With the venv activated, `python` / `python3` use that environment. If you skip activation, call the venv explicitly:

```bash
.venv/bin/python main.py query --track PE
```

### Login / Cloudflare bypass

Cloudflare on **Indeed Google OAuth** (`secure.indeed.com`) blocks most datacenter IPs even when you solve the checkbox. Two documented alternatives:

#### Preferred on cloud: BFF API (no browser login)

Calls Glassdoor’s internal interview API with `curl_cffi` TLS impersonation — skips Indeed entirely. Needs a **residential** `HTTPS_PROXY`.

```bash
# .env / Cloud Agents Secrets:
# HTTPS_PROXY=http://user:pass@host:port

python main.py batch --backend bff --track IB --limit 1 --force
```

#### Patchright session capture

Headed Patchright Chrome → login once → save `storage_state` → reuse. Still needs a clean (ideally residential) IP for Indeed/Google.

```bash
pip install -r requirements.txt
python main.py login          # solve captcha / 2FA in the Chrome window
python main.py batch --limit 1
```

State file: `data/glassdoor_state.json` (gitignored). Or run `login` at home and copy that file into the cloud workspace.

#### Automated login (`.env`)

Glassdoor uses Indeed SSO **or** Google OAuth. Automated login reads `.env`:

```bash
GLASSDOOR_EMAIL=...
GLASSDOOR_PASSWORD=...
GLASSDOOR_LOGIN_METHOD=auto   # auto|google|indeed
# Optional for Google 2FA:
# GLASSDOOR_TOTP_SECRET=BASE32SECRET
# Optional for Indeed Cloudflare:
# CAPSOLVER_API_KEY=...
# HTTPS_PROXY=http://user:pass@host:port
```

- **Gmail accounts default to Google OAuth**, but Google auth still routes through Indeed (`secure.indeed.com`) and often hits Cloudflare on datacenter IPs.
- If Google prompts 2FA, approve on your phone or set `GLASSDOOR_TOTP_SECRET`.
- Prefer `--backend bff` + residential `HTTPS_PROXY` on cloud VMs to skip Indeed login entirely.

```bash
# Auto login from .env (default when credentials are set)
python main.py batch --track IB --limit 1

# Force the old manual browser pause instead
python main.py batch --track IB --limit 1 --manual-login
```

Manual fallback (no `.env`, or `--manual-login`):

1. Browser opens to glassdoor.com
2. Sign in normally in that window
3. Press Enter in the terminal
4. Scraping continues in the same session

For batch runs you only log in once; the browser is reused for every company/role. Cookie / storage_state reuse skips login on later runs until the session expires.

### Batch scrape into the question bank

Targets live in [`config/targets.json`](config/targets.json) (starter IB / PE / banking firm list). Results merge into [`data/question_bank.json`](data/question_bank.json) with deduplication.

```bash
# One job (first matching company+position), IB track only
python main.py batch --track IB --limit 1

# All PE targets
python main.py batch --track PE --limit 5

# Full starter set (long-running)
python main.py batch --track IB
```

Useful flags:

- `--track IB|PE|Banking` — limit by track
- `--limit N` — max company+position jobs
- `--sleep 5` — seconds between jobs (default 5)
- `--targets PATH` — custom targets file
- `--bank PATH` — custom bank file
- `--manual-login` / `--no-manual-login` — force manual pause or automated `.env` login (default: auto when credentials exist)
- `--force` — redo jobs already marked complete (also backfills blurred `process` text onto existing questions)
- `--backend bff|selenium` — prefer BFF on cloud

Progress is safe to interrupt: questions are saved after every page; re-run the same batch command to skip completed jobs.

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
