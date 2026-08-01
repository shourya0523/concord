-- 037_heat_view_occurrence_topic.sql
-- Prod drift fix: published.v_firm_topic_heat must prefer occurrence.topic.
-- Glassdoor occurrences are firm signals and are NOT linked to teaching
-- canonical_questions (canonical_question_id is null for all bank rows).
-- Migration 034 already defined this view; 020's older definition can reappear
-- if DDL is reapplied out of order. This migration is idempotent.

CREATE OR REPLACE VIEW published.v_firm_topic_heat
WITH (security_invoker = true) AS
SELECT
    f.id AS firm_id,
    f.slug AS firm_slug,
    f.name AS firm_name,
    coalesce(o.topic, q.topic, 'untagged') AS topic_id,
    count(*)::integer AS sample_size,
    least(1.0, ln(count(*) + 1) / ln(50))::double precision AS intensity,
    'glassdoor_occurrence'::text AS method
FROM canonical.question_occurrences o
JOIN canonical.firms f ON f.id = o.firm_id
LEFT JOIN canonical.canonical_questions q ON q.id = o.canonical_question_id
GROUP BY f.id, f.slug, f.name, coalesce(o.topic, q.topic, 'untagged');

COMMENT ON VIEW published.v_firm_topic_heat IS
  'Mode A firm×topic intensity from tagged Glassdoor occurrences (prefers o.topic; 037)';
