-- 045_retention_core.sql
-- Daily loop + gamification (plan 2026-09-23-001 Phases 4–5):
--   daily_sets          one frozen set of cards per user per local day
--   daily_activity      per-day progress, goal met, XP, freeze use
--   user_streaks        incremental streak state (timezone-aware, no window cap)
--   readiness_snapshots per-firm readiness % per day (weekly delta)
--   user_achievements   milestones earned

CREATE TABLE IF NOT EXISTS app.daily_sets (
    user_id          text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    local_date       date NOT NULL,
    items_json       jsonb NOT NULL DEFAULT '[]'::jsonb,
    goal             integer NOT NULL CHECK (goal > 0),
    completed_count  integer NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
    completed_at     timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, local_date)
);

CREATE TABLE IF NOT EXISTS app.daily_activity (
    user_id      text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    local_date   date NOT NULL,
    cards_done   integer NOT NULL DEFAULT 0 CHECK (cards_done >= 0),
    goal         integer NOT NULL DEFAULT 8 CHECK (goal > 0),
    goal_met     boolean NOT NULL DEFAULT false,
    xp           integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
    freeze_used  boolean NOT NULL DEFAULT false,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, local_date)
);

CREATE TABLE IF NOT EXISTS app.user_streaks (
    user_id          text PRIMARY KEY REFERENCES app.users (id) ON DELETE CASCADE,
    current_streak   integer NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
    longest_streak   integer NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
    freezes          integer NOT NULL DEFAULT 0 CHECK (freezes >= 0 AND freezes <= 2),
    last_goal_date   date,
    xp_total         integer NOT NULL DEFAULT 0 CHECK (xp_total >= 0),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.readiness_snapshots (
    user_id     text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    firm_id     text NOT NULL,
    local_date  date NOT NULL,
    readiness   double precision NOT NULL CHECK (readiness >= 0 AND readiness <= 1),
    detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, firm_id, local_date)
);

CREATE TABLE IF NOT EXISTS app.user_achievements (
    user_id         text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    achievement_id  text NOT NULL,
    earned_at       timestamptz NOT NULL DEFAULT now(),
    detail_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (user_id, achievement_id)
);

-- RLS: each table is readable/writable only by its owner.
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'daily_sets', 'daily_activity', 'user_streaks',
        'readiness_snapshots', 'user_achievements'
    ]
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
