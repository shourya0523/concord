-- 057_league_sizes.sql
-- Weekly league placement (plan 2026-09-23-001 P7.3).
--
-- A joining member must see how full each league of their cohort is, but the
-- 046 read policy only exposes rows of leagues the member already belongs to.
-- app.league_sizes runs as definer and returns member COUNTS per league id
-- (no user ids, handles or XP), limited to one week and one league-id prefix
-- such as lg:2026-09-21:track-ib: so it cannot enumerate other data.

CREATE OR REPLACE FUNCTION app.league_sizes(p_week_start date, p_prefix text)
RETURNS TABLE (league_id text, members integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
    SELECT m.league_id, count(*)::integer AS members
    FROM app.league_memberships m
    WHERE m.week_start = p_week_start
      AND length(p_prefix) >= 4
      AND left(m.league_id, length(p_prefix)) = p_prefix
    GROUP BY m.league_id
$$;

REVOKE ALL ON FUNCTION app.league_sizes(date, text) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'concord_app') THEN
        GRANT EXECUTE ON FUNCTION app.league_sizes(date, text) TO concord_app;
    END IF;
END
$$;

-- league_sizes filters by week first, then by league-id prefix.
CREATE INDEX IF NOT EXISTS ix_league_memberships_week_league
    ON app.league_memberships (week_start, league_id);
