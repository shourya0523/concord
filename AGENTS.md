# Concord — Agent Instructions

This repo contains **GlassCleaner2**: a Glassdoor interview-question scraper plus Flask UI.

## Cursor Cloud specific instructions

### Toolchain

| Tool | Notes |
|------|--------|
| Python 3.12 + `.venv` | Create/activate via `.cursor/install.sh` |
| Google Chrome | Installed for Selenium / SeleniumBase |
| Docker + Compose | Optional; `sudo service docker start` |
| Node 22, `uv`, Vercel/Supabase CLIs | Available under `~/.npm-global/bin` / `~/.local/bin` |

```bash
export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"
source .venv/bin/activate
```

### Install / start

- Update (cached): `bash .cursor/install.sh`
- Start: `bash .cursor/start.sh` (Docker)

### Secrets / login

Create a local `.env` (gitignored) from `.env.example`:

```bash
GLASSDOOR_EMAIL=...
GLASSDOOR_PASSWORD=...
```

Prefer [Cloud Agents Secrets](https://cursor.com/dashboard/cloud-agents) with the same variable names in cloud runs. Do not commit real credentials.

Automated login uses Indeed SSO and may hit Cloudflare on datacenter IPs. If auto login fails, use `--manual-login` or reuse `data/glassdoor_session.json` cookies after one successful login.

### App commands

```bash
source .venv/bin/activate

# Help
python main.py --help

# Query local question bank (no browser)
python main.py query --track PE

# Browse UI
python main.py ui --port 5050
# → http://127.0.0.1:5050

# Batch scrape with .env auto-login
python main.py batch --track IB --limit 1

# Force manual browser login
python main.py batch --track IB --limit 1 --manual-login
```

### Testing / lint notes

- No automated test suite and no lint config live in this repo (no `pytest` tests, no `ruff`/`flake8`/`pre-commit`). `pytest` is only pulled in transitively by `seleniumbase`. For a quick sanity check use `python -m compileall main.py scrapers scraper_utils web`.
- `scrapers.driver.create_driver()` (SeleniumBase `uc=True`) auto-downloads a matching `chromedriver` into `.venv/.../seleniumbase/drivers/` on first use; the download needs network and only happens once.
- `python main.py query ... | head` prints a harmless `BrokenPipeError` when `head` closes the pipe early; the query itself still works.
- The `batch` scraper needs Glassdoor creds + a non-datacenter IP; the CLI `query` and the `ui` both run fully offline against `data/question_bank.json` (~2842 questions).

### Verification checklist

```bash
source .venv/bin/activate
python -c "import flask, selenium, seleniumbase"
python -c "from dotenv import load_dotenv; load_dotenv(); from scrapers.auth import credentials_configured; print(credentials_configured())"
python main.py query --track IB | head
google-chrome --version
docker info >/dev/null && echo docker_ok
```
