# Interview Question Web Scraper

> Imported from [GlassCleaner2](https://github.com/sbalsara05/GlassCleaner2). Cursor Cloud setup: see [`AGENTS.md`](AGENTS.md) and [`.cursor/`](.cursor/).

Scrape Glassdoor interview questions into a curated JSON bank for IB, PE, and banking interviews.

## Setup

1. Set up a virtual environment

```shell
python3 -m venv .venv
```

2. Activate it (required before every session)

```shell
# Windows
.venv\Scripts\activate

# Mac / Linux
source .venv/bin/activate
```

3. Install requirements (do not paste trailing comments on this line)

```shell
pip install -r requirements.txt
```

4. Configure login credentials in a local `.env` (gitignored):

```shell
cp .env.example .env
# edit GLASSDOOR_EMAIL and GLASSDOOR_PASSWORD
```

With the venv activated, `python` / `python3` use that environment. If you skip activation, call the venv explicitly:

```shell
.venv/bin/python main.py query --track PE
```

## Login flow

### Preferred: Patchright session capture (documented 2026 approach)

If auto-login or Google OAuth still lands on a Cloudflare captcha, use the documented flow: headed Patchright Chrome → login once → save full `storage_state` → reuse.

```shell
pip install -r requirements.txt
python main.py login          # solve captcha / 2FA in the Chrome window
python main.py batch --limit 1
```

State file: `data/glassdoor_state.json` (gitignored). A **residential proxy** (`HTTPS_PROXY`) greatly improves captcha pass rates on cloud/datacenter IPs.

### Automated login (`.env`)

Glassdoor uses Indeed SSO **or** Google OAuth. Automated login reads `.env`:

```shell
GLASSDOOR_EMAIL=...
GLASSDOOR_PASSWORD=...
GLASSDOOR_LOGIN_METHOD=auto   # auto|google|indeed
# Optional for Google 2FA:
# GLASSDOOR_TOTP_SECRET=BASE32SECRET
# Optional for Indeed Cloudflare:
# CAPSOLVER_API_KEY=...
# HTTPS_PROXY=http://user:pass@host:port
```

- **Gmail accounts default to Google OAuth**, which avoids Indeed’s Cloudflare Managed Challenge.
- If Google prompts 2FA, approve on your phone or set `GLASSDOOR_TOTP_SECRET`.
- Indeed email login still works on residential networks / with Capsolver + proxy; datacenter IPs are often blocked.

```shell
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

## Single-company scrape

```shell
python main.py -c "Evercore" -p "Investment Banking Analyst" -e "json"
```

Export options: `txt`, `docx`, `csv`, `pdf`, `json`.

## Batch scrape into the question bank

Targets live in [`config/targets.json`](config/targets.json) (starter IB / PE / banking firm list). Results merge into [`data/question_bank.json`](data/question_bank.json) with deduplication.

```shell
# One job (first matching company+position), IB track only
python main.py batch --track IB --limit 1

# All PE targets
python main.py batch --track PE

# Full starter set (long-running)
python main.py batch
```

Useful flags:

- `--track IB|PE|Banking` — limit by track
- `--limit N` — max company+position jobs
- `--sleep 5` — seconds between jobs (default 5)
- `--targets PATH` — custom targets file
- `--bank PATH` — custom bank file
- `--manual-login` / `--no-manual-login` — force manual pause or automated `.env` login (default: auto when credentials exist)
- `--force` — redo jobs already marked complete (also backfills blurred `process` text onto existing questions)

### Interruptions / resume

Progress is safe to interrupt:

- Questions are **saved after every page**
- A job is marked **completed** only when pagination finishes (Next disabled)
- Re-run the same batch command to **skip completed jobs** and retry partial/failed ones
- Deduping means re-scraping a partial job won’t duplicate questions

```shell
# Keep going after a crash / Wi‑Fi drop (log in again when prompted)
python main.py batch --track IB
```

## Query the bank

```shell
python main.py query --track PE
python main.py query --company "Goldman" --position Analyst
python main.py query --track IB -o ib_questions.json
```

## Browse in the UI

```shell
python main.py ui
```

Then open http://127.0.0.1:5050 — Glassdoor-green browser for filters and question search.

## Question bank format

[`data/question_bank.json`](data/question_bank.json):

```json
{
  "version": 1,
  "updated_at": "ISO-8601",
  "questions": [
    {
      "id": "sha1(company|position|question)",
      "company": "Goldman Sachs",
      "track": "IB",
      "position": "Investment Banking Analyst",
      "date_posted": "...",
      "user": "...",
      "experience": "...",
      "question": "...",
      "scraped_at": "ISO-8601"
    }
  ]
}
```

Edit [`config/targets.json`](config/targets.json) to add firms or roles. Each target is:

```json
{
  "company": "Evercore",
  "track": "IB",
  "positions": ["Investment Banking Analyst", "Investment Banking Associate"]
}
```

## Updating requirements

```shell
pip freeze > requirements.txt
```
