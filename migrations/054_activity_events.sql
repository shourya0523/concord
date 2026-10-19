-- 054_activity_events.sql
-- Learning-activity ledger (plan 2026-09-23-001 P5.2 / P5.5 / P5.6).
-- One row per graded action reported to recordLearningActivity (study attempt,
-- numeric drill, finished mock, placement card, daily-goal bonus). It backs
--   * the XP repeat rule (same subject graded within 24 h earns half)
--   * achievement counters (graded cards, first drill, first mock)
--   * an auditable XP history (sum of xp = app.user_streaks.xp_total)
-- app.daily_activity / app.user_streaks (045) stay the aggregates other
-- tracks read. This table is written only by the retention engine.

CREATE TABLE IF NOT EXISTS app.activity_events (
    id                  text PRIMARY KEY,
    user_id             text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    kind                text NOT NULL CHECK (kind IN
        ('attempt', 'drill', 'mock_complete', 'placement', 'goal_bonus')),
    subject_id          text,
    score               double precision CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
    score_source        text,
    counts_toward_goal  boolean NOT NULL DEFAULT false,
    xp                  integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
    local_date          date NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_activity_events_user_subject
    ON app.activity_events (user_id, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_activity_events_user_kind
    ON app.activity_events (user_id, kind, created_at DESC);

ALTER TABLE app.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.activity_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_activity_events_self ON app.activity_events;
CREATE POLICY app_activity_events_self ON app.activity_events
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

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'concord_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON app.activity_events TO concord_app;
    END IF;
END
$$;
