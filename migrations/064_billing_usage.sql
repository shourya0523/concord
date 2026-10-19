-- 064_billing_usage.sql
-- AI usage metering + bring-your-own-key (DESIGN.md §17.4,
-- docs/product/pricing-unit-economics.md).
--
-- Every model-backed action (grade, coaching, voice) is charged in order:
--   1. the user's own OpenRouter key (byok) — never limited, logged only
--   2. the free daily allowance             — app.ai_usage_daily, UTC days
--   3. monthly credits                       — app.billing_accounts
-- and refused (deterministic fallback / 402) when all three are exhausted.
--
-- billing_accounts.plan is set by an admin (POST /api/admin/billing) until
-- checkout exists. Credits refill lazily: the first charge in a new UTC
-- month resets credits_balance to monthly_credits.
--
-- byok_ciphertext is AES-256-GCM under BYOK_ENCRYPTION_KEY (server env);
-- the plaintext key never touches the database or the browser.
--
-- The app tolerates this migration being absent (metering fails open and
-- logs a warning; BYOK save answers 503).

CREATE TABLE IF NOT EXISTS app.billing_accounts (
    user_id          text PRIMARY KEY REFERENCES app.users (id) ON DELETE CASCADE,
    plan             text NOT NULL DEFAULT 'free'
        CHECK (plan IN ('free', 'credits', 'team', 'custom')),
    monthly_credits  integer NOT NULL DEFAULT 0 CHECK (monthly_credits >= 0),
    credits_balance  integer NOT NULL DEFAULT 0 CHECK (credits_balance >= 0),
    credits_period   text CHECK (credits_period IS NULL OR credits_period ~ '^\d{4}-\d{2}$'),
    byok_ciphertext  text,
    byok_last4       text,
    byok_added_at    timestamptz,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.ai_usage_daily (
    user_id     text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    usage_date  date NOT NULL,
    action      text NOT NULL CHECK (action IN ('grade', 'coaching', 'voice')),
    used        integer NOT NULL DEFAULT 0 CHECK (used >= 0),
    PRIMARY KEY (user_id, usage_date, action)
);

CREATE TABLE IF NOT EXISTS app.ai_usage_events (
    id          text PRIMARY KEY,
    user_id     text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    action      text NOT NULL CHECK (action IN ('grade', 'coaching', 'voice')),
    source      text NOT NULL CHECK (source IN ('byok', 'free', 'credits')),
    credits     integer NOT NULL DEFAULT 0 CHECK (credits >= 0),
    -- Idempotency key (e.g. coach:<session id>): one charge per ref.
    ref         text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_usage_events_user_ref
    ON app.ai_usage_events (user_id, ref)
    WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_ai_usage_events_user_created
    ON app.ai_usage_events (user_id, created_at DESC);

ALTER TABLE app.billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.billing_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_billing_accounts_self ON app.billing_accounts;
CREATE POLICY app_billing_accounts_self ON app.billing_accounts
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

ALTER TABLE app.ai_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_usage_daily FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_ai_usage_daily_self ON app.ai_usage_daily;
CREATE POLICY app_ai_usage_daily_self ON app.ai_usage_daily
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

ALTER TABLE app.ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_usage_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_ai_usage_events_self ON app.ai_usage_events;
CREATE POLICY app_ai_usage_events_self ON app.ai_usage_events
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
        GRANT SELECT, INSERT, UPDATE, DELETE ON app.billing_accounts TO concord_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON app.ai_usage_daily TO concord_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON app.ai_usage_events TO concord_app;
    END IF;
END
$$;
