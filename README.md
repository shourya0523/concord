# Concord

Cloud-agent-ready workspace for Concord.

## Cursor Cloud environment

This repo includes a Cursor Cloud Agents environment config:

- [`.cursor/environment.json`](.cursor/environment.json) — install + start hooks
- [`.cursor/install.sh`](.cursor/install.sh) — idempotent dependency install
- [`.cursor/start.sh`](.cursor/start.sh) — Docker / compose startup
- [`AGENTS.md`](AGENTS.md) — agent-facing runbook

After the first Cloud Agent environment setup completes, save a VM snapshot from the [Cloud Agents dashboard](https://cursor.com/dashboard/cloud-agents) so future runs boot faster.

## Local / agent toolchain

- Node.js 22 (npm, pnpm, yarn)
- Python 3.12 + uv
- Docker + Compose
- PostgreSQL and Redis CLIs
- Vercel CLI, Supabase CLI
