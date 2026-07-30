-- 020_neon_published.sql
-- App-facing views. Frontend/API must read published.*, not raw/staging.
-- security_invoker = true so RLS on underlying tables still applies (PG15+).

CREATE OR REPLACE VIEW published.v_questions
WITH (security_invoker = true) AS
SELECT
    q.id,
    q.canonical_wording,
    q.question_type,
    q.topic,
    q.subtopic,
    q.domain,
    q.track,
    q.pe_strategy,
    q.pe_relevance,
    q.seniority,
    q.difficulty,
    q.provenance,
    q.updated_at
FROM canonical.canonical_questions q
WHERE q.publishable = true
  AND q.review_state = 'published';

CREATE OR REPLACE VIEW published.v_answers
WITH (security_invoker = true) AS
SELECT
    a.id,
    a.canonical_question_id,
    a.concise_answer,
    a.expanded_explanation,
    a.assumptions_json,
    a.calculation_json,
    a.common_mistakes_json,
    a.follow_ups_json,
    a.provenance_type,
    a.confidence,
    a.difficulty,
    a.references_json,
    a.updated_at
FROM canonical.answers a
WHERE a.publishable = true
  AND a.validation_status IN ('pass', 'validated', 'published');

CREATE OR REPLACE VIEW published.v_concepts
WITH (security_invoker = true) AS
SELECT
    c.id,
    c.slug,
    c.title,
    c.summary,
    c.track,
    c.updated_at
FROM canonical.concepts c
WHERE c.publishable = true;

CREATE OR REPLACE VIEW published.v_firm_topic_heat
WITH (security_invoker = true) AS
SELECT
    f.id AS firm_id,
    f.slug AS firm_slug,
    f.name AS firm_name,
    coalesce(q.topic, 'untagged') AS topic_id,
    count(*)::integer AS sample_size,
    least(1.0, ln(count(*) + 1) / ln(50))::double precision AS intensity,
    'glassdoor_occurrence'::text AS method
FROM canonical.question_occurrences o
JOIN canonical.firms f ON f.id = o.firm_id
LEFT JOIN canonical.canonical_questions q ON q.id = o.canonical_question_id
GROUP BY f.id, f.slug, f.name, coalesce(q.topic, 'untagged');

CREATE OR REPLACE VIEW published.v_company_room_signals
WITH (security_invoker = true) AS
SELECT
    o.id AS occurrence_id,
    o.legacy_bank_id,
    o.firm_id,
    f.slug AS firm_slug,
    f.name AS firm_name,
    o.employer_raw,
    o.role_id,
    o.role_raw,
    o.track,
    o.interview_date,
    o.round_raw,
    o.confidence,
    o.scraped_at,
    o.canonical_question_id,
    pq.canonical_wording AS published_question,
    pa.id AS published_answer_id,
    v.cleaned_wording AS source_question_wording
FROM canonical.question_occurrences o
LEFT JOIN canonical.firms f ON f.id = o.firm_id
LEFT JOIN canonical.question_variants v ON v.id = o.question_variant_id
LEFT JOIN published.v_questions pq ON pq.id = o.canonical_question_id
LEFT JOIN published.v_answers pa ON pa.canonical_question_id = o.canonical_question_id;

CREATE OR REPLACE VIEW published.v_learning_resources
WITH (security_invoker = true) AS
SELECT
    r.id,
    r.label,
    r.url,
    r.kind,
    r.provenance,
    r.created_at
FROM canonical.learning_resources r;

COMMENT ON VIEW published.v_questions IS 'Published teaching questions only';
COMMENT ON VIEW published.v_firm_topic_heat IS 'Mode A firm×topic intensity from Glassdoor occurrences';
COMMENT ON VIEW published.v_company_room_signals IS 'Company rooms: signals joined to published Q/A when present';
