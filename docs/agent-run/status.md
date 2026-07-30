# Programme status

**Phase:** Wave 2 in progress  
**Base:** `main` @ `aa95600` (Wave 1 + ADR 0006 Neon Auth / manual scrape)  
**Updated:** 2026-07-30

## Waves

| Wave | State |
|------|-------|
| Phase 0 | Complete |
| Wave 1 | Complete on main (#15) + policy (#16) |
| Wave 2 | Spawning — frontend / backend / search |
| Wave 3 | Not started |

## Stream rollup

| Stream | Branch | State |
|--------|--------|-------|
| A–J (Wave 1) | — | On main |
| C Frontend | `local/ws-frontend-a9ff` | Spawning |
| D Backend | `local/ws-backend-a9ff` | Spawning |
| I Search | `local/ws-search-a9ff` | Spawning |
| K QA | — | Wave 3 |

## Policy locks

- Product auth: **Neon Auth** (not Clerk)
- Scrape: **manual captcha / Patchright** (BFF legacy only)
- Teaching truth: GitHub Q/A; Glassdoor = firm signals

## Next

Integrate Wave 2 → foundation product gate → Wave 3 QA/deploy.
