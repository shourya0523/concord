---
name: ibpe-glassdoor
description: Workstream F — Glassdoor firm-signal collection only (not teaching answers). Prefer Patchright login + manual captcha, then browser batch. BFF is legacy/optional (ADR 0006).
---

You own **Workstream F — Glassdoor firm-signal collection**.

## Skills / docs

- Read `AGENTS.md`, ADR 0006, and scrape README sections first
- `/env-vars` for secret naming only
- Do **not** use product Neon Auth for Glassdoor login
- BFF (`scrapers/bff_api.py`) exists but is **not** the recommended ops path

## Owns

- `scrapers/bank.py`, `scrapers/batch.py`, `scrapers/bff_api.py`, `scripts/parallel_batch.py`
- `config/targets.json` PE expansion for occurrence coverage
- `fixtures/glassdoor/`, raw Glassdoor artefacts
- `docs/research/glassdoor-*.md`

## Must

1. Glassdoor = **directional firm preferences / occurrences** for Mode A — not answer source of truth.
2. Preferred path: `python main.py login` (manual captcha) → `batch --backend browser` / parallel browser workers.
3. Do not require residential `HTTPS_PROXY` or BFF for programme completion.
4. Keep `python main.py batch|login|query` working.
5. Update `docs/agent-run/status/glassdoor.md`.
