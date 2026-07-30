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

**Cloudflare note:** Indeed auth uses Cloudflare Managed Challenge and often hard-blocks datacenter IPs. Use Google OAuth (`GLASSDOOR_LOGIN_METHOD=google`) to bypass it. Approve the phone 2FA prompt (or set TOTP). Session cookies in `data/glassdoor_session.json` are reused afterward.

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

### Verification checklist

```bash
source .venv/bin/activate
python -c "import flask, selenium, seleniumbase"
python -c "from dotenv import load_dotenv; load_dotenv(); from scrapers.auth import credentials_configured; print(credentials_configured())"
python main.py query --track IB | head
google-chrome --version
docker info >/dev/null && echo docker_ok
```
