# Glassdoor adapter

Multi-path Glassdoor interview fetch/parse for the IB/PE corpus.

## Access ladder (most effective first)

| Priority | Mode | When | Command |
|----------|------|------|---------|
| 1 | **question_bank** | Already scraped JSON | `ibpe import-question-bank` (bundled in pipeline) |
| 2 | **session** | `data/glassdoor_session.json` exists | `ibpe fetch-glassdoor --mode session --role "..."` |
| 3 | **browser** | SeleniumBase UC + `.env` login | `ibpe fetch-glassdoor --mode browser --role "..."` |
| 4 | **http** | Bare httpx (often 403) | `ibpe fetch-glassdoor --mode http --role "..."` |
| 5 | **fixtures** | Offline / CI | `ibpe replay-fixture …` |

`auto` picks session → browser (if creds/session) → http.

**No credentials are committed.** Use `.env` / Cloud Agent secrets:

```bash
cp .env.example .env
# GLASSDOOR_EMAIL=...
# GLASSDOOR_PASSWORD=...
```

Login once via legacy scraper to cache cookies:

```bash
pip install -r requirements.txt
python main.py batch --track PE --limit 1
# writes data/glassdoor_session.json (gitignored)
```

Then corpus fetches reuse that session:

```bash
ibpe fetch-status
ibpe fetch-glassdoor --mode auto --role "Private Equity Associate"
ibpe crawl-roles --mode auto --pages 2 --roles "Private Equity Associate,Growth Equity Associate"
```

On CAPTCHA/block the fetcher archives HTML, sets `access_state`, and stops expansion for that run.

## Layout

| Module | Role |
|--------|------|
| `urls.py` | Occupation / company / pagination URLs; `QTN_` extraction |
| `access.py` | `AccessState` from status + HTML signals |
| `fetch.py` | httpx fetcher; optional session cookies; fixture loader |
| `session.py` | Load `glassdoor_session.json` for authenticated HTTP |
| `browser_fetch.py` | SeleniumBase UC browser + GlassCleaner `ensure_login` |
| `question_bank.py` | Import `data/question_bank.json` (legacy scraper output) |
| `parse.py` | `__NEXT_DATA__` / Apollo + DOM fallback |
| `adapter.py` | `discover` / `fetch` / `parse_artefact` |

## Replay fixtures

```bash
ibpe replay-fixture fixtures/glassdoor/html/synthetic-question-detail-qtn.html
ibpe replay-fixture fixtures/glassdoor/html/occupation-investment-banking-analyst-httpx.html
```

## Pipeline

```bash
ibpe run-pipeline --mode fixtures --force
# imports fixtures + seed + GitHub CM export + question_bank.json
```
