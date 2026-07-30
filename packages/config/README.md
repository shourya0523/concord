# packages/config

**Owner:** `ibpe-architecture`

Shared environment validation and feature flags for `apps/web`, `apps/worker`, and local tooling.

## Modules

| Export | Purpose |
|--------|---------|
| `parseEnv` / `safeParseEnv` | Zod validation of scrape + product env |
| `SERVER_ONLY_ENV_KEYS` | Guard against leaking Glassdoor/DB secrets to client |
| `loadFeatureFlags` | Boolean flags via `FLAG_*` env vars |

## Rules

- Glassdoor credentials and `HTTPS_PROXY` are **server/worker only**.
- Product auth is **Clerk** (Wave 2) — never reuse Glassdoor login for end users.
- Prefer Neon (`DATABASE_URL`), Vercel Blob, Upstash Redis (see ADR 0003).
- On Vercel, prefer AI Gateway OIDC over long-lived `GEMINI_API_KEY` in the web app; keep Gemini key for Python enrich workers.
