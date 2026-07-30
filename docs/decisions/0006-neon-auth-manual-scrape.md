# ADR 0006 — Neon Auth + manual Glassdoor captcha

## Status

Accepted (2026-07-30)

## Context

Wave 1 foundation assumed Clerk for product auth and BFF (`--backend bff` + residential proxy) as the preferred cloud scrape path. Programme direction: use **Neon Auth** (Managed Better Auth on Neon) and **manual captcha / Patchright session** for dataset updates — not BFF.

## Decision

1. **Product auth = Neon Auth** (`@neondatabase/auth`), not Clerk.
   - Env: `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (+ `DATABASE_URL`).
   - App user key column: `app.users.neon_auth_user_id` (session setting `app.neon_auth_user_id` for RLS).
2. **Glassdoor collection = browser + manual captcha** via `python main.py login` → `data/glassdoor_state.json`, then `python main.py batch` / `scripts/parallel_batch.py --backend browser`.
3. **BFF remains in the repo** (`scrapers/bff_api.py`) as legacy/optional code but is **not** the recommended ops path. Do not require `HTTPS_PROXY` for normal programme work. Feature flag `scrape_bff_default` defaults to **false**.

## Consequences

- Wave 2 `ibpe-backend` wires Neon Auth handlers/middleware, not Clerk.
- Vercel env holds Neon Auth + DB secrets; Glassdoor secrets stay on workers / Cloud Agents / local `.env` only.
- Dataset refresh is operator-attended (captcha/2FA once per session).
