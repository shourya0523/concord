-- 043_attempt_grades.sql
-- Grader v2 (plan 2026-09-23-001 P0.1): persist the full grade on every
-- attempt instead of a bare 0/1, and store numeric-drill attempts (drills are
-- generated, so they cannot reference canonical.canonical_questions).

ALTER TABLE app.question_attempts
    ADD COLUMN IF NOT EXISTS session_id     text REFERENCES app.study_sessions (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS score          double precision
        CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
    ADD COLUMN IF NOT EXISTS score_source   text
        CHECK (score_source IS NULL OR score_source IN
            ('self', 'llm', 'deterministic', 'numeric', 'reveal_copy')),
    ADD COLUMN IF NOT EXISTS grade_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS confidence     double precision
        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    ADD COLUMN IF NOT EXISTS time_spent_ms  integer
        CHECK (time_spent_ms IS NULL OR time_spent_ms >= 0),
    ADD COLUMN IF NOT EXISTS grader_version text;

CREATE INDEX IF NOT EXISTS ix_question_attempts_user_created
    ON app.question_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_question_attempts_user_question
    ON app.question_attempts (user_id, question_id, created_at DESC);

COMMENT ON COLUMN app.question_attempts.grade_json IS
    'Grader output: feedback, rubric_items, numeric_checks, citations, weak_topics, follow_up.';

-- Numeric drills (P2.8): generated from packages/domain templates + seed.
CREATE TABLE IF NOT EXISTS app.drill_attempts (
    id              text PRIMARY KEY,
    user_id         text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    template_id     text NOT NULL,
    seed            text NOT NULL,
    concept_id      text,
    topic           text,
    response_text   text,
    response_value  double precision,
    expected_value  double precision NOT NULL,
    score           double precision NOT NULL CHECK (score >= 0 AND score <= 1),
    correct         boolean NOT NULL,
    time_spent_ms   integer CHECK (time_spent_ms IS NULL OR time_spent_ms >= 0),
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_drill_attempts_user_created
    ON app.drill_attempts (user_id, created_at DESC);

ALTER TABLE app.drill_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.drill_attempts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_drill_attempts_self ON app.drill_attempts;
CREATE POLICY app_drill_attempts_self ON app.drill_attempts
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
        GRANT SELECT, INSERT, UPDATE, DELETE ON app.drill_attempts TO concord_app;
    END IF;
END
$$;
