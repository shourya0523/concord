-- 044_rubrics_enrichment.sql
-- Content enrichment (plan 2026-09-23-001 Phase 2):
--   * canonical.answers.rubric_json — the grading contract (AnswerRubricSchema)
--   * staging.enrichment_proposals  — durable LLM/heuristic proposals + review
--   * canonical.question_occurrences join score (signal → teaching)
--   * canonical.question_diagrams   — question ↔ diagram links

ALTER TABLE canonical.answers
    ADD COLUMN IF NOT EXISTS rubric_json jsonb,
    ADD COLUMN IF NOT EXISTS rubric_status text
        CHECK (rubric_status IS NULL OR rubric_status IN ('pending', 'approved', 'rejected'));

COMMENT ON COLUMN canonical.answers.rubric_json IS
    'AnswerRubricSchema (packages/contracts/src/learning-loop.ts): key_points, red_flags, follow_ups, numeric_checks.';

CREATE TABLE IF NOT EXISTS staging.enrichment_proposals (
    id              text PRIMARY KEY,
    target_kind     text NOT NULL CHECK (target_kind IN
        ('question', 'answer', 'rubric', 'diagram', 'lesson', 'occurrence')),
    target_id       text NOT NULL,
    field           text NOT NULL,
    proposal_json   jsonb NOT NULL,
    current_json    jsonb,
    model           text,
    prompt_version  text,
    confidence      double precision CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    status          text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
    auto_approved   boolean NOT NULL DEFAULT false,
    reviewer        text,
    review_note     text,
    decided_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (target_kind, target_id, field, prompt_version)
);
CREATE INDEX IF NOT EXISTS ix_enrichment_proposals_status
    ON staging.enrichment_proposals (status, target_kind, created_at);

ALTER TABLE canonical.question_occurrences
    ADD COLUMN IF NOT EXISTS join_score double precision
        CHECK (join_score IS NULL OR (join_score >= 0 AND join_score <= 1)),
    ADD COLUMN IF NOT EXISTS join_method text
        CHECK (join_method IS NULL OR join_method IN ('exact', 'fuzzy', 'embedding', 'manual'));

CREATE TABLE IF NOT EXISTS canonical.question_diagrams (
    question_id  text NOT NULL REFERENCES canonical.canonical_questions (id) ON DELETE CASCADE,
    diagram_id   text NOT NULL REFERENCES canonical.diagrams (id) ON DELETE CASCADE,
    relevance    double precision NOT NULL DEFAULT 1.0
        CHECK (relevance >= 0 AND relevance <= 1),
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (question_id, diagram_id)
);
CREATE INDEX IF NOT EXISTS ix_question_diagrams_diagram
    ON canonical.question_diagrams (diagram_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'concord_app') THEN
        GRANT SELECT ON canonical.question_diagrams TO concord_app;
    END IF;
END
$$;
