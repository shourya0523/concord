# ADR 0004 — Preserve `python main.py` CLI during monorepo evolution

## Status

Accepted (Wave 1)

## Context

Operators and cloud agents rely on `python main.py {login,batch,query,ui}`. Moving scrape code under `apps/worker` too early would break AGENTS.md workflows and parallel streams.

## Decision

1. Keep repo-root `main.py` as the stable CLI shim for the full Wave 1–2 migration.
2. `scrapers/` and `src/ibpe_corpus/` remain live Python packages until intentionally relocated.
3. Flask `web/` remains the interim bank browser; Next.js `apps/web` does not replace it until Wave 2 ships.
4. Worker entrypoints may wrap the same modules; they must not delete or rename CLI subcommands without an orchestrator note.
5. TypeScript contracts are Zod-first; Python Pydantic in `src/ibpe_corpus/schemas/models.py` is the mirror (hand-sync in Wave 1).

## Consequences

- Architecture stubs packages without deleting Python entrypoints.
- Infra CI must continue to exercise `python main.py --help` / query smoke.
- Future relocation: `apps/worker` imports scrape modules; `main.py` becomes a thin wrapper only.
