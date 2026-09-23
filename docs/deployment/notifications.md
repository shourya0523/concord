# Reminders, web push and leagues

**Plan:** `docs/plans/2026-09-23-001-learning-loop-grading-retention-plan.md` Phase 6 (P6.1–P6.4) and P7.3.
**Flags:** `notifications`, `leagues` (`packages/config/src/flags.ts`, env `FLAG_NOTIFICATIONS` / `FLAG_LEAGUES`).
**Tables:** `app.notification_log`, `app.push_subscriptions`, `app.league_memberships` (046) + `app.league_sizes()` (057).

Everything degrades safely: with no provider keys the senders return `{ status: "skipped" }`, the cron reports what it would have done, and the settings UI says the channel is not configured.

## Moving parts

| Piece | Where | What it does |
|-------|-------|--------------|
| Settings UI | `components/settings-island.tsx` → `components/notification-settings.tsx` | Reminder hour (or off), timezone (auto-detected, editable), email / push channels, weekly recap, pause all, league opt-in |
| Prefs | `app.user_profiles.preferences_json.profile` (`timezone`, `reminder_hour`, `notify_email`, `notify_push`, `weekly_recap`, `league_opt_in`) saved via `PUT /api/profile` (full object) · `preferences_json.notify.paused` via `PUT /api/notifications/prefs` | |
| Planner | `lib/notify/plan.ts` (pure, unit-tested) | Decides `(user, kind, channel)` for one cron run |
| Runner | `lib/notify/run.ts` + `lib/notify/store.ts` | Claim → send → mark, per planned item |
| Email | `lib/notify/email.ts`, `lib/notify/templates.ts` | Resend over `fetch`, plain HTML + text, one-click unsubscribe |
| Push | `lib/notify/push.ts`, `public/sw.js`, `POST/DELETE /api/push/subscribe` | `web-push` + VAPID; 404/410 deletes the subscription |
| Cron | `GET /api/cron/notify`, `apps/web/vercel.json` (`0 * * * *`) | Hourly run + league XP refresh |
| Unsubscribe | `GET/POST /api/notifications/unsubscribe?token=…` | HMAC token → `notify_email = false` |
| Leagues | `lib/data/leagues.ts`, `GET /api/leagues/current`, `POST/DELETE /api/leagues/membership`, `/leagues` | Opt-in weekly XP league with anonymous handles |

## Scheduling rules (planner)

| Kind | When (user's local time) | Condition | Channels |
|------|--------------------------|-----------|----------|
| `daily_reminder` | `reminder_hour` | daily goal not met today | email, push |
| `streak_at_risk` | 20:00 | live streak ≥ 3 and goal not met (replaces that evening's daily reminder) | email, push |
| `weekly_recap` | Sunday 18:00 | `weekly_recap` on | email only |

- Each kind fires in a **2-hour window** starting at its hour, so a late/skipped cron run or a DST spring-forward gap (e.g. 02:00 on the US change day) still delivers once. The window never crosses local midnight.
- **Cap:** at most 2 distinct kinds per user per local day. Priority when capped: streak-at-risk, daily reminder, weekly recap.
- **Idempotency:** `app.notification_log` is unique on `(user_id, kind, channel, local_date)`. The runner **inserts the row first** (the claim), sends, then sets `status` to `sent` / `skipped` / `failed` with provider detail. A concurrent or repeated run cannot claim the same row. Only `failed` rows can be re-claimed (retry inside the window).
- Users without a timezone are treated as UTC. "Pause all" and all-channels-off users are filtered in SQL.
- The live streak ignores a stale `user_streaks.current_streak` (last goal day older than yesterday, not covered by freezes). Streak **freeze rollover is not applied by the cron**: the retention track owns streak writes and exposes no rollover function yet. When it does, call it from `app/api/cron/notify/route.ts` before `runNotify`.

## Database access: why the cron uses the owner connection

The cron spans every user, so it runs **without** the per-user RLS GUC (`app.neon_auth_user_id`). That only returns rows for a role that bypasses RLS:

- `CRON_DATABASE_URL` — set this to the **owner** (`neondb_owner`, BYPASSRLS) pooled URL. Server-only secret.
- If unset, the cron falls back to `DATABASE_URL`. That works today (production `DATABASE_URL` is still the owner) but **stops working** once `DATABASE_URL` moves to `concord_app` (`docs/deployment/app-db-role.md`): every cross-user query then sees zero rows.
- The cron response includes `rls_bypass` and a note when it is false, so a mis-set URL is visible in the Vercel cron log.

Every query on this connection filters by `user_id` explicitly. All per-user request paths (settings, push subscribe, leagues, unsubscribe) still run as the user under RLS via `withRlsUserId`. The unsubscribe route has no session; the signed token identifies the user and the write runs under RLS as that user.

## Environment

| Var | Scope | Needed for |
|-----|-------|-----------|
| `CRON_SECRET` | secret | Vercel sends `Authorization: Bearer $CRON_SECRET`; the route returns 401 without it. Also the fallback unsubscribe signing key |
| `CRON_DATABASE_URL` | secret | Owner URL for the cron (see above) |
| `RESEND_API_KEY` | secret | Email. Unset → email skipped |
| `NOTIFY_FROM_EMAIL` | server | e.g. `Concord <reminders@yourdomain>`; domain verified in Resend |
| `NOTIFY_REPLY_TO` | server | Optional |
| `NOTIFY_SIGNING_SECRET` | secret | Unsubscribe HMAC key (`openssl rand -base64 32`). Rotating it invalidates old links |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | secret | Push. `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | server | `mailto:` contact; defaults to `mailto:$NOTIFY_FROM_EMAIL` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | public | Same value as `VAPID_PUBLIC_KEY` (public by design). Never the private key |
| `NEXT_PUBLIC_APP_URL` | public | Absolute links in emails (falls back to `VERCEL_PROJECT_PRODUCTION_URL`) |

Inventory: `docs/agent-run/env-inventory.md`, template: `.env.example`.

## Owner setup checklist

1. Apply `migrations/057_league_sizes.sql` (after 046) with the owner URL.
2. Resend: verify the sending domain, create an API key, set `RESEND_API_KEY` + `NOTIFY_FROM_EMAIL` on Vercel (Preview first).
3. `npx web-push generate-vapid-keys` → set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`.
4. Set `NOTIFY_SIGNING_SECRET` and `CRON_DATABASE_URL`.
5. **Vercel plan:** Hobby projects only run crons once a day. The hourly schedule needs Pro; on Hobby, trigger the route hourly from elsewhere (e.g. a GitHub Actions schedule calling it with the bearer secret).
6. Dry run in the target env:

   ```bash
   curl -s -H "Authorization: Bearer $CRON_SECRET" \
     "$BASE_URL/api/cron/notify?dry_run=1&now=2026-09-27T13:00:00Z" | jq
   ```

   `dry_run=1` plans without claiming or sending and lists `planned_items`; `now` is honoured only with `dry_run`.
7. Send yourself one: set your reminder hour to the current local hour in Settings, then call the route without `dry_run`.

## Web push notes

- The toggle in Settings asks for notification permission, registers `/sw.js` (scope `/`), subscribes with the VAPID public key and `POST`s the subscription. Turning it off unsubscribes in the browser and `DELETE`s the row.
- Push opt-in unlocks after the first completed daily goal (plan P6.3); an existing subscription stays manageable.
- iOS Safari supports web push only for sites added to the Home Screen.
- The service worker handles `push`, `notificationclick` (focus an open tab or open `/today`) and `pushsubscriptionchange`. It does not cache anything.

## Leagues (P7.3)

- **Opt-in only** (`league_opt_in` on the profile; Settings toggle or the `/leagues` page). Opting out deletes this week's row, so you vanish from standings at once.
- **Week** = Monday–Sunday in the member's timezone. Weekly XP = Σ `app.daily_activity.xp` for that week, refreshed on every read (own row) and by the hourly cron (all rows of the last two weeks).
- **Grouping:** leagues of ≤ 30 by cohort (optional free text such as "2027 SA", normalised, case-insensitive) else by track. Placement fills the lowest-numbered league with room, using `app.league_sizes()` (definer function returning counts only).
- **Privacy:** handles are `adjective-animal-###` from a SHA-256 of user id + week, rotating weekly; the API returns handle, XP, rank, zone and an `is_you` flag only — never user ids, names or emails. RLS lets a member read only rows of leagues they belong to.
- Promotion/demotion (top/bottom 20%, from 5 members) is copy only; there are no tiers.
- **Integrator:** add a link to `/leagues` from Progress (owned by another track).

## Verification (local)

- Unit tests: `npm test --workspace=@ibpe/web` (planner incl. DST/half-hour zones/caps/idempotency, runner with an in-memory store, token signing, Resend + web-push adapters with injected transports, templates, league grouping/handles/standings).
- SQL: every store / prefs / leagues query was run against local Postgres 16 with seeded rows through the Neon HTTP shim (`scripts/dev/neon_http_shim.py`), as the owner for the cron and as `concord_app` under RLS for request paths — including claim races, failed-row re-claim, 410 subscription cleanup, the weekly-recap aggregates and cross-user isolation of push endpoints and league rows.
