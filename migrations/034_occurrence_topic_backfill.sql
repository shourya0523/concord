-- 034_occurrence_topic_backfill.sql
-- Bug fix: published.v_firm_topic_heat returned only 'untagged' rows because
-- occurrences were never topic-tagged (canonical.question_topics empty,
-- canonical_questions.topic mostly NULL). Backfill both with the same
-- deterministic keyword rules as packages/search/src/topics.ts (first match wins),
-- then rewrite the heat view to read occurrence-level tags.

-- ---------------------------------------------------------------------------
-- 1) Tag Glassdoor occurrences (signals only) from variant wording.
--    question_topics.question_id has FK → canonical_questions, so occurrence
--    tags live in a dedicated nullable column on question_occurrences.
-- ---------------------------------------------------------------------------
ALTER TABLE canonical.question_occurrences
    ADD COLUMN IF NOT EXISTS topic text;

UPDATE canonical.question_occurrences o
SET topic = tagged.topic_slug,
    updated_at = now()
FROM (
    SELECT
        o2.id AS occurrence_id,
        CASE
            WHEN v.cleaned_wording ~* '\mlbo\M|leveraged buyout|\mmoic\M|\mirr\M|debt paydown' THEN 'lbo'
            WHEN v.cleaned_wording ~* '\mdcf\M|discounted cash|\mwacc\M|comparable compan|trading multipl|precedent transaction|\mvaluation\M' THEN 'valuation'
            WHEN v.cleaned_wording ~* 'enterprise value|equity value|\mev\M.*\mequity\M' THEN 'enterprise_value'
            WHEN v.cleaned_wording ~* 'three (financial )?statements|income statement|balance sheet|cash flow statement|depreciation|working capital|\mgaap\M' THEN 'accounting'
            WHEN v.cleaned_wording ~* 'working capital|\mnwc\M' THEN 'working_capital'
            WHEN v.cleaned_wording ~* '\mmerger\M|\maccretion\M|\mdilution\M|\mm\s*&\s*a\M|accretive' THEN 'merger_models'
            WHEN v.cleaned_wording ~* 'capital structure|cost of (debt|equity|capital)|\mleverage\M' THEN 'capital_structure'
            WHEN v.cleaned_wording ~* 'investment thesis|underwrite|why (this|that) (deal|company|investment)' THEN 'investment_thesis'
            WHEN v.cleaned_wording ~* 'due diligence|\mdd\M' THEN 'due_diligence'
            WHEN v.cleaned_wording ~* 'restructur|bankrupt|distressed' THEN 'restructuring'
            WHEN v.cleaned_wording ~* '\mreturns?\M|\mmoic\M|\mirr\M' THEN 'returns'
            WHEN v.cleaned_wording ~* 'value creation|operational improve|add-?on acquisition' THEN 'value_creation'
            WHEN v.cleaned_wording ~* 'tell me about yourself|why (ib|investment banking|private equity|our firm)|walk me through your resume|strengths? and weaknesses?|behavioral' THEN 'behavioral'
            ELSE 'untagged'
        END AS topic_slug
    FROM canonical.question_occurrences o2
    JOIN canonical.question_variants v ON v.id = o2.question_variant_id
) AS tagged
WHERE o.id = tagged.occurrence_id
  AND tagged.topic_slug <> 'untagged';

-- ---------------------------------------------------------------------------
-- 2) Tag untagged teaching-corpus questions (canonical_wording) so the
--    published corpus carries topics for drills / search weighting.
-- ---------------------------------------------------------------------------
UPDATE canonical.canonical_questions q
SET topic = tagged.topic_slug,
    updated_at = now()
FROM (
    SELECT
        id,
        CASE
            WHEN canonical_wording ~* '\mlbo\M|leveraged buyout|\mmoic\M|\mirr\M|debt paydown' THEN 'lbo'
            WHEN canonical_wording ~* '\mdcf\M|discounted cash|\mwacc\M|comparable compan|trading multipl|precedent transaction|\mvaluation\M' THEN 'valuation'
            WHEN canonical_wording ~* 'enterprise value|equity value|\mev\M.*\mequity\M' THEN 'enterprise_value'
            WHEN canonical_wording ~* 'three (financial )?statements|income statement|balance sheet|cash flow statement|depreciation|working capital|\mgaap\M' THEN 'accounting'
            WHEN canonical_wording ~* 'working capital|\mnwc\M' THEN 'working_capital'
            WHEN canonical_wording ~* '\mmerger\M|\maccretion\M|\mdilution\M|\mm\s*&\s*a\M|accretive' THEN 'merger_models'
            WHEN canonical_wording ~* 'capital structure|cost of (debt|equity|capital)|\mleverage\M' THEN 'capital_structure'
            WHEN canonical_wording ~* 'investment thesis|underwrite|why (this|that) (deal|company|investment)' THEN 'investment_thesis'
            WHEN canonical_wording ~* 'due diligence|\mdd\M' THEN 'due_diligence'
            WHEN canonical_wording ~* 'restructur|bankrupt|distressed' THEN 'restructuring'
            WHEN canonical_wording ~* '\mreturns?\M|\mmoic\M|\mirr\M' THEN 'returns'
            WHEN canonical_wording ~* 'value creation|operational improve|add-?on acquisition' THEN 'value_creation'
            WHEN canonical_wording ~* 'tell me about yourself|why (ib|investment banking|private equity|our firm)|walk me through your resume|strengths? and weaknesses?|behavioral' THEN 'behavioral'
            ELSE 'untagged'
        END AS topic_slug
    FROM canonical.canonical_questions
    WHERE topic IS NULL
) AS tagged
WHERE q.id = tagged.id
  AND tagged.topic_slug <> 'untagged';

-- ---------------------------------------------------------------------------
-- 3) Rewrite the Mode A heat view: occurrence tag wins over canonical tag.
-- ---------------------------------------------------------------------------
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

COMMENT ON VIEW published.v_firm_topic_heat IS 'Mode A firm×topic intensity from tagged Glassdoor occurrences (keyword_rules_v1)';

-- Also expose the occurrence tag through company-room signals.
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
    v.cleaned_wording AS source_question_wording,
    o.topic
FROM canonical.question_occurrences o
LEFT JOIN canonical.firms f ON f.id = o.firm_id
LEFT JOIN canonical.question_variants v ON v.id = o.question_variant_id
LEFT JOIN published.v_questions pq ON pq.id = o.canonical_question_id
LEFT JOIN published.v_answers pa ON pa.canonical_question_id = o.canonical_question_id;
