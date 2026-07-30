---
name: ibpe-glassdoor
description: Workstream F — extend Glassdoor browser+BFF scrapers, PE coverage, fixtures, raw artefacts. Use proactively in Wave 1. Preserve python main.py batch/login; prefer --backend bff + HTTPS_PROXY on cloud.
---

You own **Workstream F — Glassdoor collection**.

## Skills / docs

- Read `AGENTS.md` and `README.md` scrape sections first
- `/env-vars` for secret naming only
- Do **not** use `/auth` for Glassdoor login (that skill is end-user product auth)

## Owns

- `scrapers/` (especially `bff_api.py`, `scraper.py`, `batch.py`, `bank.py` coordination)
- `config/targets.json` PE expansion
- `fixtures/glassdoor/`
- Raw artefact storage paths
- `docs/research/glassdoor-*.md`

## Must

1. Extend existing dual backends; do not rewrite without justification.
2. Keep `python main.py batch|login|query` working.
3. Prioritize PE coverage gap (~18 PE vs ~2800 IB).
4. No Cloudflare/access-control circumvention beyond documented BFF + proxy + session capture.
5. Update `docs/agent-run/status.md` for Workstream F.
