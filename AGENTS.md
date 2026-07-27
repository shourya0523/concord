# Concord — Agent Instructions

## Cursor Cloud specific instructions

### Toolchain (preinstalled on this environment)

| Tool | Notes |
|------|--------|
| Node.js 22 + npm / pnpm / yarn | User CLIs under `~/.npm-global/bin` |
| Python 3.12 + `uv` | `uv` at `~/.local/bin` |
| Docker + Compose | `fuse-overlayfs` storage; start via `sudo service docker start` |
| PostgreSQL client (`psql`) | 16.x |
| Redis CLI | 7.x |
| Vercel CLI / Supabase CLI | Global via npm user prefix |
| Rust, Go, Java 21 | Available if needed |

Ensure PATH includes user tools:

```bash
export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"
```

### Install / start

- Update (cached): `bash .cursor/install.sh` — installs deps when manifests exist
- Start: `bash .cursor/start.sh` — brings up Docker (and compose if present)

### Secrets

Add API keys and DB URLs in the [Cloud Agents Secrets](https://cursor.com/dashboard/cloud-agents) tab. Do not commit `.env` files with real credentials.

### Working on this repo

The repo starts empty aside from Cloud environment config. When application code lands:

1. Prefer committing lockfiles so `install.sh` can use frozen installs.
2. Document run/test commands in this file under a new section.
3. Put long-running app processes in `.cursor/environment.json` `terminals` (or start them during the task).

### Verification checklist

Before finishing setup-related work:

```bash
node -v && npm -v
python3 --version && uv --version
docker info >/dev/null && docker compose version
vercel --version && supabase --version
```
