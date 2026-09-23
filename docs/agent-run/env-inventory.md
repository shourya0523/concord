# Env variable inventory

Updated: 2026-09-23 · reminders + leagues vars (docs/deployment/notifications.md) · earlier: 2026-07-30 Wave 3 promote · ADR 0006

Split: **scrape/worker secrets** never go to Vercel public / `NEXT_PUBLIC_*`. **Product** vars are Neon + Blob + cron + public app URL.

## Scrape / Cloud Agents / workers (not Vercel public)

| Var | Scope | Notes |
|-----|-------|-------|
| `GLASSDOOR_EMAIL` | secret | Scrape login |
| `GLASSDOOR_PASSWORD` | secret | |
| `GLASSDOOR_LOGIN_METHOD` | config | auto\|google\|indeed |
| `GLASSDOOR_TOTP_SECRET` | secret | Optional 2FA |
| `GLASSDOOR_STATE_PATH` | config | Optional override for `storage_state` JSON |
| `HTTPS_PROXY` | secret | Optional; **not required** for supported manual-captcha path |
| `CURL_CFFI_IMPERSONATE` | config | Optional legacy BFF |
| `CAPSOLVER_API_KEY` | secret | Optional |
| `GEMINI_API_KEY` | secret | Enrichment workers (prefer AI Gateway on Vercel web) |

Session artefacts (never env-public): `data/glassdoor_state.json`, `data/glassdoor_session.json`.

## Product / Vercel

| Var | Scope | Notes |
|-----|-------|-------|
| `DATABASE_URL` | secret | Neon Postgres. Should connect as `concord_app` (RLS enforced), not `neondb_owner`: see `docs/deployment/app-db-role.md` |
| `NEON_AUTH_BASE_URL` | secret/server | Neon Console → Auth → Configuration |
| `NEON_AUTH_COOKIE_SECRET` | secret | `openssl rand -base64 32` (≥32 chars) — **unset → auth stub** |
| `NEXT_PUBLIC_APP_URL` | public | App origin (e.g. `https://concord-umber.vercel.app`) |
| `AI_GATEWAY_*` / model ids | secret | Prefer Gateway over raw Gemini in app |
| `CRON_SECRET` | secret | Scheduled handlers only; Vercel cron sends `Authorization: Bearer $CRON_SECRET` to `/api/cron/notify` (hourly, `apps/web/vercel.json`) |
| `CRON_DATABASE_URL` | secret | Owner / `BYPASSRLS` Neon URL for cross-user cron work (notify run, league XP refresh). Falls back to `DATABASE_URL`; **required** once `DATABASE_URL` is `concord_app`. See `docs/deployment/notifications.md` |
| `RESEND_API_KEY` | secret | Reminder / recap email (Resend). Unset → email no-op (`skipped`) |
| `NOTIFY_FROM_EMAIL` | server | Sender, e.g. `Concord <reminders@…>` on a verified Resend domain. Required with `RESEND_API_KEY` |
| `NOTIFY_REPLY_TO` | server | Optional reply-to for reminder emails |
| `NOTIFY_SIGNING_SECRET` | secret | HMAC key for one-click unsubscribe tokens; falls back to `CRON_SECRET`. Rotating it invalidates old links |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | secret (private) | Web Push keys (`npx web-push generate-vapid-keys`). Unset → push no-op |
| `VAPID_SUBJECT` | server | `mailto:` or https contact for push services; defaults to `mailto:$NOTIFY_FROM_EMAIL` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | public | Same value as `VAPID_PUBLIC_KEY` (VAPID public keys are meant to be public). Never put the private key in `NEXT_PUBLIC_*` |
| `FLAG_NOTIFICATIONS` / `FLAG_LEAGUES` | server | Feature flags (default on in `packages/config`); off → cron skips, league routes 404 |
| `BLOB_READ_WRITE_TOKEN` | secret | Raw artefact storage |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | secret | Optional cache / rate limits |
| `EDGE_CONFIG` | secret/server | Optional feature flags |
| `SENTRY_DSN` | secret | Optional; server-only when monitoring wired |
| `VERCEL_OIDC_TOKEN` | auto | Injected on Vercel; `vercel env pull` locally |

## CI / deploy (GitHub Actions — when CLI deploy enabled)

| Var | Scope | Notes |
|-----|-------|-------|
| `VERCEL_TOKEN` | secret | CLI auth — **missing in Wave 3 agent run** |
| `VERCEL_ORG_ID` | secret | From `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | secret | From `.vercel/project.json` |

## Hygiene rules

- Never put Glassdoor cookies/proxy into `NEXT_PUBLIC_*`.
- **Do not use Clerk** — product auth is Neon Auth (ADR 0006).
- Do not run `python main.py batch` inside Vercel request handlers; workers / Cloud Agents only.
- Inventory mirror: `.env.example`, `apps/worker/.env.worker.example`.
