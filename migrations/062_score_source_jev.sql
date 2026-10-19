-- 062_score_source_jev.sql
-- Grader = Jev decisions + small-LLM escalation (docs/decision-log.md).
-- Grades produced by the Jev decision model are stored with
-- score_source = jev, so the question_attempts score_source CHECK from 043
-- is recreated with that value added. Idempotent: every CHECK on
-- question_attempts that mentions score_source (the unnamed 043 one, or the
-- named one from an earlier apply of this file) is dropped, then the named
-- constraint is added again.

DO $$
DECLARE
    con record;
BEGIN
    FOR con IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'app'
          AND t.relname = 'question_attempts'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%score_source%'
    LOOP
        EXECUTE format('ALTER TABLE app.question_attempts DROP CONSTRAINT %I', con.conname);
    END LOOP;
END
$$;

ALTER TABLE app.question_attempts
    ADD CONSTRAINT question_attempts_score_source_check
    CHECK (score_source IS NULL OR score_source IN
        ('self', 'llm', 'jev', 'deterministic', 'numeric', 'reveal_copy'));

COMMENT ON COLUMN app.question_attempts.score_source IS
    'How the attempt was graded: self, llm (small chat model), jev (Jev decision model), deterministic, numeric or reveal_copy.';
