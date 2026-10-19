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

- Glassdoor credentials are **server/worker only** (manual captcha path; proxy optional).
- Product auth is **Neon Auth** (Wave 2, ADR 0006) — never reuse Glassdoor login for end users; do not use Clerk.
- Prefer Neon (`DATABASE_URL`), Vercel Blob, Upstash Redis (see ADR 0003).
- The web app's LLM calls go through OpenRouter: `OPENROUTER_API_KEY` (server-only) plus the `LLM_*_MODEL` tiers — see `docs/deployment/llm-stack.md`. `GEMINI_API_KEY` is no longer read by the TypeScript stack.
