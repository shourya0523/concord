-- 042_app_rls_role.sql
-- Make RLS a real second line of defence for the web app.
--
-- neondb_owner (the role in the Vercel DATABASE_URL today) has BYPASSRLS via
-- Neon, so every app.* policy is ignored for it. This migration:
--   1. creates concord_app: a non-owner LOGIN role with NOBYPASSRLS and only
--      the grants the web app needs
--   2. adds the missing per-user policies (review_queue, confidence_ratings,
--      study_plans, study_session_questions)
--   3. forces RLS on every app.* table and fails if any app.* table is left
--      without RLS, FORCE, or a policy.
--
-- The password is NOT set here. The owner sets it once per branch with
--   ALTER ROLE concord_app WITH PASSWORD '<generated>'
-- and then points DATABASE_URL at concord_app (docs/deployment/app-db-role.md).
-- Create the role with SQL, not the Neon console/API: console-created roles
-- join neon_superuser, and neondb_owner (created that way) has BYPASSRLS.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'concord_app') THEN
        CREATE ROLE concord_app LOGIN NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
END
$$;

-- Re-assert attributes in case the role already existed with different ones.
-- SUPERUSER and REPLICATION are default-off and neondb_owner may not name
-- them, so the guard at the end checks rolsuper instead.
ALTER ROLE concord_app LOGIN NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;

-- Schemas: read the catalog, read/write per-user app state. No raw, staging,
-- admin or neon_auth access.
GRANT USAGE ON SCHEMA app, published, canonical TO concord_app;

-- published.* views are security_invoker, so the invoker also needs SELECT on
-- the canonical tables underneath (canonical RLS keeps them to published rows).
GRANT SELECT ON ALL TABLES IN SCHEMA published TO concord_app;
GRANT SELECT ON ALL TABLES IN SCHEMA canonical TO concord_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO concord_app;

-- Missing per-user policies. review_queue matches 041_review_queue_scheduling.

DROP POLICY IF EXISTS app_review_queue_self ON app.review_queue;
CREATE POLICY app_review_queue_self ON app.review_queue
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

DROP POLICY IF EXISTS app_confidence_ratings_self ON app.confidence_ratings;
CREATE POLICY app_confidence_ratings_self ON app.confidence_ratings
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

DROP POLICY IF EXISTS app_study_plans_self ON app.study_plans;
CREATE POLICY app_study_plans_self ON app.study_plans
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

DROP POLICY IF EXISTS app_study_session_questions_self ON app.study_session_questions;
CREATE POLICY app_study_session_questions_self ON app.study_session_questions
    FOR ALL
    USING (
        session_id IN (
            SELECT s.id
            FROM app.study_sessions s
            JOIN app.users u ON u.id = s.user_id
            WHERE u.neon_auth_user_id = nullif(current_setting('app.neon_auth_user_id', true), '')
        )
    )
    WITH CHECK (
        session_id IN (
            SELECT s.id
            FROM app.study_sessions s
            JOIN app.users u ON u.id = s.user_id
            WHERE u.neon_auth_user_id = nullif(current_setting('app.neon_auth_user_id', true), '')
        )
    );

-- FORCE on every app.* table (030/032 forced only some of them).
ALTER TABLE app.users FORCE ROW LEVEL SECURITY;
ALTER TABLE app.user_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE app.bookmarks FORCE ROW LEVEL SECURITY;
ALTER TABLE app.notes FORCE ROW LEVEL SECURITY;
ALTER TABLE app.collections FORCE ROW LEVEL SECURITY;
ALTER TABLE app.collection_items FORCE ROW LEVEL SECURITY;
ALTER TABLE app.question_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE app.confidence_ratings FORCE ROW LEVEL SECURITY;
ALTER TABLE app.mastery_records FORCE ROW LEVEL SECURITY;
ALTER TABLE app.study_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE app.study_session_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE app.study_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE app.review_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE app.target_company_sets FORCE ROW LEVEL SECURITY;
ALTER TABLE app.module_progress FORCE ROW LEVEL SECURITY;

-- Guard: every app.* table must have RLS enabled, forced, and a policy, and
-- concord_app must not bypass RLS. A new app table without them fails here.
DO $$
DECLARE
    bad text;
BEGIN
    SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO bad
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relkind IN ('r', 'p')
      AND (
          NOT c.relrowsecurity
          OR NOT c.relforcerowsecurity
          OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
      );
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'app tables missing RLS, FORCE or a policy: %', bad;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'concord_app' AND (rolbypassrls OR rolsuper)
    ) THEN
        RAISE EXCEPTION 'concord_app must be NOBYPASSRLS and NOSUPERUSER';
    END IF;
END
$$;
