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
GLASSDOOR_LOGIN_METHOD=google   # recommended for gmail — skips Indeed Cloudflare
# GLASSDOOR_TOTP_SECRET=...     # optional Google Authenticator secret
# CAPSOLVER_API_KEY=...         # optional Indeed Turnstile solver
# HTTPS_PROXY=...               # optional residential proxy
```

Prefer [Cloud Agents Secrets](https://cursor.com/dashboard/cloud-agents) with the same variable names in cloud runs. Do not commit real credentials.

**Cloudflare / captcha (documented approaches):** Automated Selenium/Google OAuth often still hits Cloudflare Managed Challenge on datacenter IPs. 2026 guides (Thunderbit, Clura, Patchright) recommend:

1. **Patchright** headed Chrome (`channel="chrome"`) — not vanilla Playwright/Selenium
2. **Manual login once** (solve captcha + 2FA in the window)
3. Save full **`storage_state`** → `data/glassdoor_state.json` (cookies + localStorage)
4. Reuse that state on scrape/batch
5. Use a **residential proxy** (`HTTPS_PROXY`) when possible — datacenter IPs re-challenge

```bash
python main.py login          # headed capture; approve 2FA / captcha in Chrome
python main.py batch --limit 1
```

Fallback: Google OAuth auto-login (`GLASSDOOR_LOGIN_METHOD=google`) + phone 2FA. Legacy cookie jar: `data/glassdoor_session.json`.

### App commands

```bash
source .venv/bin/activate

# Help
python main.py --help

# One-time session capture (Patchright) — preferred when captcha blocks auto-login
python main.py login

# Query local question bank (no browser)
python main.py query --track PE

# Browse UI
python main.py ui --port 5050
# → http://127.0.0.1:5050

# Batch scrape (reuses glassdoor_state.json / .env auto-login)
python main.py batch --track IB --limit 1

# Force manual browser login
python main.py batch --track IB --limit 1 --manual-login
```

### Verification checklist

```bash
source .venv/bin/activate
python -c "import flask, selenium, seleniumbase, patchright"
python -c "from dotenv import load_dotenv; load_dotenv(); from scrapers.auth import credentials_configured; print(credentials_configured())"
python -c "from scrapers.session_state import state_path; print(state_path())"
python main.py query --track IB | head
google-chrome --version
docker info >/dev/null && echo docker_ok
```
