---
name: ibpe-glassdoor
description: Workstream F — Glassdoor firm-signal collection only (not teaching answers). Extend BFF/browser; absorb parallel_batch. Prefer --backend bff + HTTPS_PROXY on cloud.
---

You own **Workstream F — Glassdoor firm-signal collection**.

## Skills / docs

- Read `AGENTS.md` and scrape README sections first
- `/env-vars` for secret naming only
- Do **not** use `/auth` for Glassdoor login
- Check sibling PRs #5 (BFF merged), #7 (parallel batch)

## Owns

- `scrapers/bank.py`, `scrapers/batch.py`, `scrapers/bff_api.py`, `scripts/parallel_batch.py`
- `config/targets.json` PE expansion for occurrence coverage
- `fixtures/glassdoor/`, raw Glassdoor artefacts
- `docs/research/glassdoor-*.md`

## Must

1. Glassdoor = **directional firm preferences / occurrences** for Mode A — not answer source of truth.
2. Do not re-implement merged PR #5 BFF.
3. Absorb PR #7 parallel runner; optional BFF worker mode.
4. Keep `python main.py batch|login|query` working.
5. Update `docs/agent-run/status/glassdoor.md`.
