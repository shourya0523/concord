-- 041_review_queue_scheduling.sql
-- Spaced review (DESIGN.md §10.9): one scheduled row per user × question with
-- SM-2-lite state, so Again/Hard/Good/Easy ratings drive the next due date.

ALTER TABLE app.review_queue
    ADD COLUMN IF NOT EXISTS interval_days double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ease double precision NOT NULL DEFAULT 2.5,
    ADD COLUMN IF NOT EXISTS repetitions integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_rating text
        CHECK (last_rating IS NULL OR last_rating IN ('again', 'hard', 'good', 'easy')),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Keep the newest row per user × question before adding the unique key.
DELETE FROM app.review_queue rq
USING app.review_queue newer
WHERE rq.user_id = newer.user_id
  AND rq.question_id = newer.question_id
  AND (rq.created_at, rq.id) < (newer.created_at, newer.id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_review_queue_user_question
    ON app.review_queue (user_id, question_id);
CREATE INDEX IF NOT EXISTS ix_review_queue_user_due
    ON app.review_queue (user_id, due_at);

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
