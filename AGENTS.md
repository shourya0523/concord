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

# Batch scrape (needs interactive Chrome login)
python main.py batch --track IB --limit 1
```

Scraping opens Chrome and waits for manual Glassdoor login, then Enter in the terminal. Prefer `query` / `ui` for non-interactive verification.

### Secrets

Optional `.env` for local secrets. Prefer [Cloud Agents Secrets](https://cursor.com/dashboard/cloud-agents). Do not commit real credentials.

### Verification checklist

```bash
source .venv/bin/activate
python -c "import flask, selenium, seleniumbase"
python main.py query --track IB | head
google-chrome --version
docker info >/dev/null && echo docker_ok
```
