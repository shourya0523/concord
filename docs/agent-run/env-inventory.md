# Env variable inventory (Phase 0)

## Existing (scrape / cloud)

| Var | Scope | Notes |
|-----|-------|-------|
| `GLASSDOOR_EMAIL` | secret | Scrape login |
| `GLASSDOOR_PASSWORD` | secret | |
| `GLASSDOOR_LOGIN_METHOD` | config | auto\|google\|indeed |
| `GLASSDOOR_TOTP_SECRET` | secret | Optional 2FA |
| `HTTPS_PROXY` | secret | Residential for BFF |
| `CAPSOLVER_API_KEY` | secret | Optional |
| `GEMINI_API_KEY` | secret | Enrichment (Wave 1 H) |

## Planned (product)

| Var | Scope | Notes |
|-----|-------|-------|
| `DATABASE_URL` | secret | Neon |
| `AUTH_SECRET` / Clerk keys | secret | Via Vercel integration |
| `NEXT_PUBLIC_CLERK_*` | public | Auth UI only |
| `AI_GATEWAY_*` / model ids | secret | Prefer Gateway over raw Gemini in app |
| `CRON_SECRET` | secret | Scheduled jobs |
| `BLOB_READ_WRITE_TOKEN` | secret | Raw artefact storage |

Never put Glassdoor cookies/proxy into `NEXT_PUBLIC_*`.
