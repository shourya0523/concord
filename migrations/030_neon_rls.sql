-- 030_neon_rls.sql
-- RLS baseline. Neon Auth wiring lands in Wave 2 (backend sets app.neon_auth_user_id).

ALTER TABLE raw.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.source_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.source_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.crawl_failures ENABLE ROW LEVEL SECURITY;

ALTER TABLE staging.raw_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.staging_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.normalised_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.validation_results ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.question_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.confidence_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mastery_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.study_session_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.review_queue ENABLE ROW LEVEL SECURITY;

ALTER TABLE admin.ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.dead_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.merge_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.review_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.feature_flags ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.bookmarks FORCE ROW LEVEL SECURITY;
ALTER TABLE app.notes FORCE ROW LEVEL SECURITY;
ALTER TABLE app.question_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE app.mastery_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_users_self ON app.users;
CREATE POLICY app_users_self ON app.users
    FOR ALL
    USING (neon_auth_user_id = nullif(current_setting('app.neon_auth_user_id', true), ''))
    WITH CHECK (neon_auth_user_id = nullif(current_setting('app.neon_auth_user_id', true), ''));

DROP POLICY IF EXISTS app_profiles_self ON app.user_profiles;
CREATE POLICY app_profiles_self ON app.user_profiles
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

DROP POLICY IF EXISTS app_bookmarks_self ON app.bookmarks;
CREATE POLICY app_bookmarks_self ON app.bookmarks
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

DROP POLICY IF EXISTS app_notes_self ON app.notes;
CREATE POLICY app_notes_self ON app.notes
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

DROP POLICY IF EXISTS app_attempts_self ON app.question_attempts;
CREATE POLICY app_attempts_self ON app.question_attempts
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

DROP POLICY IF EXISTS app_mastery_self ON app.mastery_records;
CREATE POLICY app_mastery_self ON app.mastery_records
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

DROP POLICY IF EXISTS app_sessions_self ON app.study_sessions;
CREATE POLICY app_sessions_self ON app.study_sessions
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

ALTER TABLE canonical.canonical_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical.concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical.question_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS canonical_questions_published_read ON canonical.canonical_questions;
CREATE POLICY canonical_questions_published_read ON canonical.canonical_questions
    FOR SELECT
    USING (publishable = true AND review_state = 'published');

DROP POLICY IF EXISTS answers_published_read ON canonical.answers;
CREATE POLICY answers_published_read ON canonical.answers
    FOR SELECT
    USING (publishable = true);

DROP POLICY IF EXISTS concepts_published_read ON canonical.concepts;
CREATE POLICY concepts_published_read ON canonical.concepts
    FOR SELECT
    USING (publishable = true);

DROP POLICY IF EXISTS occurrences_read ON canonical.question_occurrences;
CREATE POLICY occurrences_read ON canonical.question_occurrences
    FOR SELECT
    USING (true);

GRANT USAGE ON SCHEMA published TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA published TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA published GRANT SELECT ON TABLES TO PUBLIC;

COMMENT ON SCHEMA raw IS 'RLS enabled; service/migrator only — no PUBLIC grants';
COMMENT ON SCHEMA staging IS 'RLS enabled; service/migrator only — no PUBLIC grants';
