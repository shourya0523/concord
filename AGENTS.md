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
# GEMINI_API_KEY=...            # Gemini for later LLM features
```

Prefer [Cloud Agents Secrets](https://cursor.com/dashboard/cloud-agents) with the same variable names in cloud runs. Do not commit real credentials.

**Cloudflare / captcha (documented approaches):** Automated Selenium/Google OAuth often still hits Cloudflare on Indeed (`secure.indeed.com`) from **datacenter IPs**. 2026 guides converge on:

### A) Preferred on cloud: BFF API + residential proxy (no browser login)

Skips Indeed/Google OAuth entirely. Uses `curl_cffi` Chrome TLS impersonation against Glassdoor’s internal interview BFF endpoint.

```bash
# Set residential HTTPS_PROXY in Cloud Agents Secrets / .env first
python main.py batch --backend bff --track IB --limit 1 --force
```

### B) Patchright session capture (headed)

1. **Patchright** headed Chrome (`channel="chrome"`)
2. **Manual login once** (solve captcha + 2FA) — needs residential IP or home network
3. Save **`storage_state`** → `data/glassdoor_state.json`
4. Reuse on scrape/batch

```bash
python main.py login          # headed capture; approve 2FA / captcha in Chrome
python main.py batch --limit 1
```

### C) Login at home, upload state

Run `python main.py login` on a residential network, copy `data/glassdoor_state.json` into the cloud workspace, then `python main.py batch --limit 1`.

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

# Batch scrape via BFF API (no browser / Indeed login — needs HTTPS_PROXY)
python main.py batch --backend bff --track IB --limit 1 --force

# Batch scrape (browser; reuses glassdoor_state.json / .env auto-login)
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
