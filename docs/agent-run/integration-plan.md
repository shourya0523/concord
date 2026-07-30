# Integration plan

## Merge order (after each wave)

1. **Architecture** (`packages/contracts`, `packages/config`) — unblocks everyone
2. **Database** migrations (sole owner; never rewrite others' migration files)
3. **Design system** (`packages/ui`) before frontend
4. **Infra** CI/vercel scaffolding (keep workflows green)
5. **Data-quality** then **Answers** (teaching corpus before enrich)
6. **Glassdoor** (signal layer; can land anytime if it does not thrash contracts)

## Branch rules

- One workstream → one branch `local/ws-<name>-a9ff`
- Commit/push often; update only `docs/agent-run/status/<stream>.md`
- Rebase onto latest `main` before asking for integrate
- No force-push to `main`

## Conflict hotspots

| Hotspot | Mitigation |
|---------|------------|
| `.env.example` | Architecture proposes; infra reviews in PR |
| `README.md` / `AGENTS.md` | Small additive patches; orchestrator resolves |
| `src/ibpe_corpus/schemas/` vs `packages/contracts` | Architecture owns TS/Zod; data-quality keeps Pydantic in sync via noted mirror |
| `apps/web` package.json | Design-system may init; frontend owns feature deps in Wave 2 |

## Gates (prompt §45)

- **Foundation:** contracts + tokens + migration path + bank importer design
- **Data:** idempotent imports; GitHub teaching truth; Glassdoor occurrences only
- **Product / Deploy / Release:** Wave 2–3

## When a stream is blocked

Document blocker in status file; orchestrator relaunches only that stream; others continue.
