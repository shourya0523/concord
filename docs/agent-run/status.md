# Programme status

**Phase:** Wave 2 integrated — awaiting land on main  
**Integrate branch:** `local/wave2-integrate-a9ff`  
**Updated:** 2026-07-30

## Waves

| Wave | State |
|------|-------|
| Phase 0 | Complete |
| Wave 1 | Complete on main (#15 + #16) |
| Wave 2 | Integrated — frontend + Neon Auth backend + search |
| Wave 3 | Next after #wave2 lands |

## Stream rollup

| Stream | Branch | State |
|--------|--------|-------|
| C Frontend | `local/ws-frontend-a9ff` | Merged into integrate |
| D Backend | `local/ws-backend-a9ff` | Merged into integrate |
| I Search | `local/ws-search-a9ff` | Merged into integrate |

## Verify

- `@ibpe/web` typecheck green
- `@ibpe/search` tests green
- Neon Auth stubs when env missing; set `NEON_AUTH_*` for live auth
