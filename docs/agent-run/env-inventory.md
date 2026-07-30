# Env variable inventory

Updated: 2026-07-30 · ADR 0006 (Neon Auth + manual scrape)

## Scrape / Cloud Agents (not Vercel public)

| Var | Scope | Notes |
|-----|-------|-------|
| `GLASSDOOR_EMAIL` | secret | Scrape login |
| `GLASSDOOR_PASSWORD` | secret | |
| `GLASSDOOR_LOGIN_METHOD` | config | auto\|google\|indeed |
| `GLASSDOOR_TOTP_SECRET` | secret | Optional 2FA |
| `HTTPS_PROXY` | secret | Optional; **not required** for supported manual-captcha path |
| `CAPSOLVER_API_KEY` | secret | Optional |
| `GEMINI_API_KEY` | secret | Enrichment workers |

## Product / Vercel

| Var | Scope | Notes |
|-----|-------|-------|
| `DATABASE_URL` | secret | Neon Postgres |
| `NEON_AUTH_BASE_URL` | secret/server | Neon Console → Auth → Configuration |
| `NEON_AUTH_COOKIE_SECRET` | secret | `openssl rand -base64 32` (≥32 chars) |
| `NEXT_PUBLIC_APP_URL` | public | App origin |
| `AI_GATEWAY_*` / model ids | secret | Prefer Gateway over raw Gemini in app |
| `CRON_SECRET` | secret | Scheduled jobs |
| `BLOB_READ_WRITE_TOKEN` | secret | Raw artefact storage |

Never put Glassdoor cookies/proxy into `NEXT_PUBLIC_*`. **Do not use Clerk** — product auth is Neon Auth.
