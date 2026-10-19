-- 063_league_tiers.sql
-- League tables with real tiers (DESIGN.md §16 "Working Papers", pass 3).
--
-- Tiers, low → high: 0 Boutique · 1 Middle Market · 2 Bulge Bracket ·
-- 3 Elite Boutique. A week's membership row carries the tier it was played
-- in; when the week ends it is settled once: final rank, league size and the
-- result (promoted / held / demoted). The next week's row starts in the tier
-- the result implies. League ids embed the tier (lg:<week>:t<tier>-<cohort>:<n>)
-- so members only meet others in the same tier.
--
-- Settlement runs two ways, both idempotent (settled_at guard):
--   * lazily, by the member under RLS, the next time they open /leagues
--     (their own row only; the 046 read policy already lets them read their
--     league's rows to rank themselves);
--   * by the daily cron on the owner connection, for every finished week.
--
-- The app tolerates this migration being absent (no tier columns → every
-- member plays tier 0 and nothing is settled).

ALTER TABLE app.league_memberships
    ADD COLUMN IF NOT EXISTS tier smallint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS final_rank integer,
    ADD COLUMN IF NOT EXISTS league_size integer,
    ADD COLUMN IF NOT EXISTS result text,
    ADD COLUMN IF NOT EXISTS settled_at timestamptz;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'league_memberships_tier_range'
    ) THEN
        ALTER TABLE app.league_memberships
            ADD CONSTRAINT league_memberships_tier_range CHECK (tier BETWEEN 0 AND 3);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'league_memberships_result_kind'
    ) THEN
        ALTER TABLE app.league_memberships
            ADD CONSTRAINT league_memberships_result_kind
            CHECK (result IS NULL OR result IN ('promoted', 'held', 'demoted'));
    END IF;
END
$$;

-- Unsettled finished weeks (cron scan).
CREATE INDEX IF NOT EXISTS ix_league_memberships_unsettled
    ON app.league_memberships (week_start)
    WHERE settled_at IS NULL;
