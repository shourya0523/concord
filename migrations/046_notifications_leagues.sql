-- 046_notifications_leagues.sql
-- Reminders (plan 2026-09-23-001 Phase 6) and opt-in weekly leagues (Phase 7).
--   notification_log     idempotency + daily caps for reminders
--   push_subscriptions   Web Push endpoints (VAPID)
--   league_memberships   opt-in weekly XP league rows with anonymised handles
--
-- The notify cron runs with the owner role (it spans users) and app routes run
-- as the user under RLS.

CREATE TABLE IF NOT EXISTS app.notification_log (
    id          text PRIMARY KEY,
    user_id     text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN
        ('daily_reminder', 'streak_at_risk', 'weekly_recap')),
    channel     text NOT NULL CHECK (channel IN ('email', 'push')),
    local_date  date NOT NULL,
    status      text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'skipped', 'failed')),
    detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, kind, channel, local_date)
);
CREATE INDEX IF NOT EXISTS ix_notification_log_user_date
    ON app.notification_log (user_id, local_date);

CREATE TABLE IF NOT EXISTS app.push_subscriptions (
    id          text PRIMARY KEY,
    user_id     text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    endpoint    text NOT NULL UNIQUE,
    p256dh      text NOT NULL,
    auth        text NOT NULL,
    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.league_memberships (
    user_id     text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    week_start  date NOT NULL,
    league_id   text NOT NULL,
    handle      text NOT NULL,
    cohort      text,
    xp          integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, week_start)
);
CREATE INDEX IF NOT EXISTS ix_league_memberships_league
    ON app.league_memberships (league_id, week_start, xp DESC);

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['notification_log', 'push_subscriptions']
    LOOP
        EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS app_%s_self ON app.%I', t, t);
        EXECUTE format($p$
            CREATE POLICY app_%s_self ON app.%I
                FOR ALL
                USING (
                    user_id IN (
                        SELECT id FROM app.users
                        WHERE neon_auth_user_id = nullif(current_setting('app.neon_auth_user_id', true), '')
                    )
                )
                WITH CHECK (
                    user_id IN (
                        SELECT id FROM app.users
                        WHERE neon_auth_user_id = nullif(current_setting('app.neon_auth_user_id', true), '')
                    )
                )
        $p$, t, t);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'concord_app') THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON app.%I TO concord_app', t);
        END IF;
    END LOOP;
END
$$;

-- Leagues: write only your own row, read every row in a league you belong to
-- (handles are anonymised, no user ids leave the server).
ALTER TABLE app.league_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.league_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_league_memberships_self_write ON app.league_memberships;
CREATE POLICY app_league_memberships_self_write ON app.league_memberships
    FOR ALL
    USING (
        user_id IN (
            SELECT id FROM app.users
            WHERE neon_auth_user_id = nullif(current_setting('app.neon_auth_user_id', true), '')
        )
    )
    WITH CHECK (
        user_id IN (
            SELECT id FROM app.users
            WHERE neon_auth_user_id = nullif(current_setting('app.neon_auth_user_id', true), '')
        )
    );

-- Membership lookup runs as definer so the read policy does not recurse into
-- league_memberships' own RLS.
CREATE OR REPLACE FUNCTION app.current_user_league_keys()
RETURNS TABLE (league_id text, week_start date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
    SELECT m.league_id, m.week_start
    FROM app.league_memberships m
    JOIN app.users u ON u.id = m.user_id
    WHERE u.neon_auth_user_id = nullif(current_setting('app.neon_auth_user_id', true), '')
$$;

DROP POLICY IF EXISTS app_league_memberships_league_read ON app.league_memberships;
CREATE POLICY app_league_memberships_league_read ON app.league_memberships
    FOR SELECT
    USING ((league_id, week_start) IN (SELECT * FROM app.current_user_league_keys()));

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'concord_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON app.league_memberships TO concord_app;
        GRANT EXECUTE ON FUNCTION app.current_user_league_keys() TO concord_app;
    END IF;
END
$$;
