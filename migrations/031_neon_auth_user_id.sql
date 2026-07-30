-- 031_neon_auth_user_id.sql
-- ADR 0006: if an older deploy created app.users.clerk_user_id, rename it.
-- Fresh installs from 010/030 already use neon_auth_user_id — this is a no-op then.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'users'
          AND column_name = 'clerk_user_id'
    ) THEN
        ALTER TABLE app.users RENAME COLUMN clerk_user_id TO neon_auth_user_id;
    END IF;
END $$;

COMMENT ON COLUMN app.users.neon_auth_user_id IS
    'Neon Auth (Managed Better Auth) user id; RLS via SET LOCAL app.neon_auth_user_id';
