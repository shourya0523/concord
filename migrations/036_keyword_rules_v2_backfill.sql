-- 036_keyword_rules_v2_backfill.sql
-- Gap-close for Glassdoor firm signals: apply expanded high-precision
-- keyword_rules_v2 to rows left untagged by 034_keyword_rules_v1.
-- Mirrors packages/search/src/topics.ts first-match order as closely as
-- PostgreSQL regex allows. Glassdoor occurrences remain firm signals only.

-- ---------------------------------------------------------------------------
-- 1) Backfill remaining untagged occurrence topics from variant wording.
-- ---------------------------------------------------------------------------
UPDATE canonical.question_occurrences o
SET topic = tagged.topic_slug,
    updated_at = now()
FROM (
    SELECT
        o2.id AS occurrence_id,
        CASE
            WHEN v.cleaned_wording ~* '\mlbo\M|leveraged buyout|paper lbo|\mmoic\M|\mirr\M|debt paydown|cash sweep|sources? and uses?|entry multiple|exit multiple|sponsor returns?|dividend recap|management rollover' THEN 'lbo'
            WHEN v.cleaned_wording ~* '\mdcf\M|discounted cash flow|\mwacc\M|\mcapm\M|comparable compan|\mcomps\M|trading multipl|transaction multipl|precedent transaction|\mvaluation\M|terminal value|gordon growth|perpetuity growth|free cash flow|\mfcf\M|unlevered|\mddm\M|dividend discount model' THEN 'valuation'
            WHEN v.cleaned_wording ~* 'enterprise value|equity value|\mev\M.*\mequity\M|\mequity\M.*\mev\M|net debt|minority interest|preferred stock|treasury stock method|fully diluted shares?' THEN 'enterprise_value'
            WHEN v.cleaned_wording ~* 'working capital|\mnwc\M|accounts? receivable|accounts? payable|cash conversion cycle|inventory turnover' THEN 'working_capital'
            WHEN v.cleaned_wording ~* 'three (financial )?statements|income statement|balance sheet|cash flow statement|depreciation|amortization|\mgaap\M|goodwill|impairment|write-?down|deferred tax|revenue recognition|net income|\mcogs\M|capital expenditure|\mcapex\M' THEN 'accounting'
            WHEN v.cleaned_wording ~* '\mmerger\M|\maccretion\M|\mdilution\M|\mm\s*&\s*a\M|mergers? and acquisitions?|merger model|accretive|dilutive|purchase accounting|pro forma eps|deal synergies|stock (deal|consideration)|cash (deal|consideration)|exchange ratio' THEN 'merger_models'
            WHEN v.cleaned_wording ~* 'credit analysis|credit agreement|credit facility|credit metrics?|credit risk|credit spread|credit rating|debt capacity|\mcovenants?\M|interest coverage|leverage ratio|loan-?to-?value|\mltv\M|private credit|leveraged finance|high yield|default risk' THEN 'credit'
            WHEN v.cleaned_wording ~* 'capital structure|cost of (debt|equity|capital)|\mleverage\M|debt (vs\.?|versus) equity|debt financing|equity financing|convertible debt|preferred equity|\mrevolver\M|term loan|senior debt|subordinated debt' THEN 'capital_structure'
            WHEN v.cleaned_wording ~* 'investment thesis|underwrite|why (this|that) (deal|investment)|why (this|that) company as (an? )?investment|would you (invest in|acquire|buy)|attractive investment|good investment|pitch me (a|an) (stock|investment|company)|stock pitch|investment idea|long pitch|short pitch|buy or sell|growth drivers?' THEN 'investment_thesis'
            WHEN v.cleaned_wording ~* 'due diligence|\mdd\M|quality of earnings|\mqoe\M|commercial diligence|customer calls?|\mcim\M|data room|management presentation' THEN 'due_diligence'
            WHEN v.cleaned_wording ~* 'restructur|bankrupt|distressed|chapter 11|liquidation|recovery value|waterfall|debtor-?in-?possession|\mdip financing\M' THEN 'restructuring'
            WHEN v.cleaned_wording ~* '\mreturns?\M|\mmoic\M|\mirr\M|cash-?on-?cash|multiple of (invested )?money|\mroic\M|return on invested capital|hurdle rate' THEN 'returns'
            WHEN v.cleaned_wording ~* 'value creation|operational improve|add-?on acquisition|tuck-?in acquisition|platform acquisition|portfolio company|margin expansion|cost cuts?|revenue growth|100-?day plan' THEN 'value_creation'
            WHEN v.cleaned_wording ~* 'industry coverage|coverage group|sector trends?|industry trends?|which (industry|sector).*(follow|interested)|what (industry|sector).*(follow|interested)|(healthcare|technology|fig|industrials|consumer|retail|energy) (group|coverage|sector)' THEN 'industry_coverage'
            WHEN v.cleaned_wording ~* 'current markets?|market conditions?|market news|recent market|stock market|yield curve|interest rates?|\mfed\M|federal reserve|inflation|macroeconomic|\mmacro\M|\ms\s*&\s*p\s*500\M' THEN 'markets'
            WHEN v.cleaned_wording ~* 'brain ?teasers?|mental math|market sizing|how many .* (fit|are in|in a)\M|(tennis|golf|ping pong) balls?|manhole covers?|probability (question|problem|puzzle)|coin flips?|\mdice\M' THEN 'brainteasers'
            WHEN v.cleaned_wording ~* 'tell me about yourself|why (ib|investment banking|private equity|banking|our firm)|why (do you )?(want to )?(work|join).*(firm|bank|company|team)|walk me through your resume|strengths? and weaknesses?|\mfit\M|behavioral|tell me about a time|teamwork|\mconflict\M|\mfailure\M|leadership' THEN 'behavioral'
            ELSE 'untagged'
        END AS topic_slug
    FROM canonical.question_occurrences o2
    JOIN canonical.question_variants v ON v.id = o2.question_variant_id
    WHERE coalesce(o2.topic, 'untagged') = 'untagged'
) AS tagged
WHERE o.id = tagged.occurrence_id
  AND tagged.topic_slug <> 'untagged';

-- ---------------------------------------------------------------------------
-- 2) Backfill remaining untagged canonical teaching/signal question topics.
-- ---------------------------------------------------------------------------
UPDATE canonical.canonical_questions q
SET topic = tagged.topic_slug,
    updated_at = now()
FROM (
    SELECT
        id,
        CASE
            WHEN canonical_wording ~* '\mlbo\M|leveraged buyout|paper lbo|\mmoic\M|\mirr\M|debt paydown|cash sweep|sources? and uses?|entry multiple|exit multiple|sponsor returns?|dividend recap|management rollover' THEN 'lbo'
            WHEN canonical_wording ~* '\mdcf\M|discounted cash flow|\mwacc\M|\mcapm\M|comparable compan|\mcomps\M|trading multipl|transaction multipl|precedent transaction|\mvaluation\M|terminal value|gordon growth|perpetuity growth|free cash flow|\mfcf\M|unlevered|\mddm\M|dividend discount model' THEN 'valuation'
            WHEN canonical_wording ~* 'enterprise value|equity value|\mev\M.*\mequity\M|\mequity\M.*\mev\M|net debt|minority interest|preferred stock|treasury stock method|fully diluted shares?' THEN 'enterprise_value'
            WHEN canonical_wording ~* 'working capital|\mnwc\M|accounts? receivable|accounts? payable|cash conversion cycle|inventory turnover' THEN 'working_capital'
            WHEN canonical_wording ~* 'three (financial )?statements|income statement|balance sheet|cash flow statement|depreciation|amortization|\mgaap\M|goodwill|impairment|write-?down|deferred tax|revenue recognition|net income|\mcogs\M|capital expenditure|\mcapex\M' THEN 'accounting'
            WHEN canonical_wording ~* '\mmerger\M|\maccretion\M|\mdilution\M|\mm\s*&\s*a\M|mergers? and acquisitions?|merger model|accretive|dilutive|purchase accounting|pro forma eps|deal synergies|stock (deal|consideration)|cash (deal|consideration)|exchange ratio' THEN 'merger_models'
            WHEN canonical_wording ~* 'credit analysis|credit agreement|credit facility|credit metrics?|credit risk|credit spread|credit rating|debt capacity|\mcovenants?\M|interest coverage|leverage ratio|loan-?to-?value|\mltv\M|private credit|leveraged finance|high yield|default risk' THEN 'credit'
            WHEN canonical_wording ~* 'capital structure|cost of (debt|equity|capital)|\mleverage\M|debt (vs\.?|versus) equity|debt financing|equity financing|convertible debt|preferred equity|\mrevolver\M|term loan|senior debt|subordinated debt' THEN 'capital_structure'
            WHEN canonical_wording ~* 'investment thesis|underwrite|why (this|that) (deal|investment)|why (this|that) company as (an? )?investment|would you (invest in|acquire|buy)|attractive investment|good investment|pitch me (a|an) (stock|investment|company)|stock pitch|investment idea|long pitch|short pitch|buy or sell|growth drivers?' THEN 'investment_thesis'
            WHEN canonical_wording ~* 'due diligence|\mdd\M|quality of earnings|\mqoe\M|commercial diligence|customer calls?|\mcim\M|data room|management presentation' THEN 'due_diligence'
            WHEN canonical_wording ~* 'restructur|bankrupt|distressed|chapter 11|liquidation|recovery value|waterfall|debtor-?in-?possession|\mdip financing\M' THEN 'restructuring'
            WHEN canonical_wording ~* '\mreturns?\M|\mmoic\M|\mirr\M|cash-?on-?cash|multiple of (invested )?money|\mroic\M|return on invested capital|hurdle rate' THEN 'returns'
            WHEN canonical_wording ~* 'value creation|operational improve|add-?on acquisition|tuck-?in acquisition|platform acquisition|portfolio company|margin expansion|cost cuts?|revenue growth|100-?day plan' THEN 'value_creation'
            WHEN canonical_wording ~* 'industry coverage|coverage group|sector trends?|industry trends?|which (industry|sector).*(follow|interested)|what (industry|sector).*(follow|interested)|(healthcare|technology|fig|industrials|consumer|retail|energy) (group|coverage|sector)' THEN 'industry_coverage'
            WHEN canonical_wording ~* 'current markets?|market conditions?|market news|recent market|stock market|yield curve|interest rates?|\mfed\M|federal reserve|inflation|macroeconomic|\mmacro\M|\ms\s*&\s*p\s*500\M' THEN 'markets'
            WHEN canonical_wording ~* 'brain ?teasers?|mental math|market sizing|how many .* (fit|are in|in a)\M|(tennis|golf|ping pong) balls?|manhole covers?|probability (question|problem|puzzle)|coin flips?|\mdice\M' THEN 'brainteasers'
            WHEN canonical_wording ~* 'tell me about yourself|why (ib|investment banking|private equity|banking|our firm)|why (do you )?(want to )?(work|join).*(firm|bank|company|team)|walk me through your resume|strengths? and weaknesses?|\mfit\M|behavioral|tell me about a time|teamwork|\mconflict\M|\mfailure\M|leadership' THEN 'behavioral'
            ELSE 'untagged'
        END AS topic_slug
    FROM canonical.canonical_questions
    WHERE coalesce(topic, 'untagged') = 'untagged'
) AS tagged
WHERE q.id = tagged.id
  AND tagged.topic_slug <> 'untagged';

COMMENT ON VIEW published.v_firm_topic_heat IS 'Mode A firm×topic intensity from tagged Glassdoor occurrences (keyword_rules_v2)';
