-- 038_topic_rules_v3_and_domains.sql
-- Gap-close for remaining untagged Glassdoor occurrences + teaching Q topics/domains.
-- Idempotent: only updates rows still untagged / domain=other.
-- Mirrors packages/search/src/topics.ts keyword_rules_v3 additions.

-- ---------------------------------------------------------------------------
-- 1) Occurrence topic backfill (v3 gap rules + prior v2 patterns for safety)
-- ---------------------------------------------------------------------------
UPDATE canonical.question_occurrences o
SET topic = tagged.topic_slug,
    updated_at = now()
FROM (
    SELECT
        o2.id AS occurrence_id,
        CASE
            -- valuation / FCF gaps (v3)
            WHEN v.cleaned_wording ~* 'levered fcf|unlevered fcf|how do i get to (levered |unlevered )?fcf|free cash flow' THEN 'valuation'
            -- investment thesis / pitch
            WHEN v.cleaned_wording ~* 'stock pitch|pitch (me )?(a |an )?(stock|company|investment)|recent deal|deal (you|i) (was |have )?follow' THEN 'investment_thesis'
            -- markets / news
            WHEN v.cleaned_wording ~* 'recent (news|market|transaction)|market (news|conditions?|you.?re interested)|in the news|view (the )?(real estate |equity )?market' THEN 'markets'
            -- behavioral CV / why firm gaps (v3) — firm name may sit between Why and IB
            WHEN v.cleaned_wording ~* 'walk me through your (resume|cv)|tell me about your (resume|cv)|why .{0,40}(goldman|morgan stanley|jpmorgan|jp morgan|blackstone|kkr|evercore|lazard|barclays|ubs|deutsche|bank of america|jefferies|wells fargo|citi|hsbc|rbc).{0,40}(ib|investment banking|banking|private equity|pe)?|why (did you choose|would you (like to )?work|do you want to (work|join|apply))|where .{0,20}(see yourself|in 5 years)|hobbies|strengths? and weaknesses?|tell me about yourself|why (ib|investment banking|private equity|banking|our firm|this (firm|role|position|company))' THEN 'behavioral'
            -- prior high-precision rules (same order as 036)
            WHEN v.cleaned_wording ~* '\mlbo\M|leveraged buyout|paper lbo|\mmoic\M|\mirr\M|debt paydown|cash sweep|sources? and uses?|entry multiple|exit multiple|sponsor returns?|dividend recap|management rollover' THEN 'lbo'
            WHEN v.cleaned_wording ~* '\mdcf\M|discounted cash flow|\mwacc\M|\mcapm\M|comparable compan|\mcomps\M|trading multipl|transaction multipl|precedent transaction|\mvaluation\M|terminal value|gordon growth|perpetuity growth|free cash flow|\mfcf\M|unlevered|\mddm\M|dividend discount model' THEN 'valuation'
            WHEN v.cleaned_wording ~* 'enterprise value|equity value|\mev\M.*\mequity\M|\mequity\M.*\mev\M|net debt|minority interest|preferred stock|treasury stock method|fully diluted shares?' THEN 'enterprise_value'
            WHEN v.cleaned_wording ~* 'working capital|\mnwc\M|accounts? receivable|accounts? payable|cash conversion cycle|inventory turnover' THEN 'working_capital'
            WHEN v.cleaned_wording ~* 'three (financial )?statements|income statement|balance sheet|cash flow statement|depreciation|amortization|\mgaap\M|goodwill|impairment|write-?down|deferred tax|revenue recognition|net income|\mcogs\M|capital expenditure|\mcapex\M' THEN 'accounting'
            WHEN v.cleaned_wording ~* '\mmerger\M|\maccretion\M|\mdilution\M|\mm\s*&\s*a\M|mergers? and acquisitions?|merger model|accretive|dilutive|purchase accounting|pro forma eps|deal synergies|stock (deal|consideration)|cash (deal|consideration)|exchange ratio' THEN 'merger_models'
            WHEN v.cleaned_wording ~* 'credit analysis|credit agreement|credit facility|credit metrics?|credit risk|credit spread|credit rating|debt capacity|\mcovenants?\M|interest coverage|leverage ratio|loan-?to-?value|\mltv\M|private credit|leveraged finance|high yield|default risk' THEN 'credit'
            WHEN v.cleaned_wording ~* 'capital structure|cost of (debt|equity|capital)|\mleverage\M|debt (vs\.?|versus) equity|debt financing|equity financing|convertible debt|preferred equity|\mrevolver\M|term loan|senior debt|subordinated debt' THEN 'capital_structure'
            WHEN v.cleaned_wording ~* 'investment thesis|underwrite|why (this|that) (deal|investment)|would you (invest in|acquire|buy)|attractive investment|good investment|investment idea|long pitch|short pitch|buy or sell|growth drivers?' THEN 'investment_thesis'
            WHEN v.cleaned_wording ~* 'due diligence|\mdd\M|quality of earnings|\mqoe\M|commercial diligence|customer calls?|\mcim\M|data room|management presentation' THEN 'due_diligence'
            WHEN v.cleaned_wording ~* 'restructur|bankrupt|distressed|chapter 11|liquidation|recovery value|waterfall|debtor-?in-?possession|\mdip financing\M' THEN 'restructuring'
            WHEN v.cleaned_wording ~* '\mreturns?\M|\mmoic\M|\mirr\M|cash-?on-?cash|multiple of (invested )?money|\mroic\M|return on invested capital|hurdle rate' THEN 'returns'
            WHEN v.cleaned_wording ~* 'value creation|operational improve|add-?on acquisition|tuck-?in acquisition|platform acquisition|portfolio company|margin expansion|cost cuts?|revenue growth|100-?day plan' THEN 'value_creation'
            WHEN v.cleaned_wording ~* 'industry coverage|coverage group|sector trends?|industry trends?|(healthcare|technology|fig|industrials|consumer|retail|energy) (group|coverage|sector)' THEN 'industry_coverage'
            WHEN v.cleaned_wording ~* 'current markets?|market conditions?|stock market|yield curve|interest rates?|\mfed\M|federal reserve|inflation|macroeconomic|\mmacro\M|\ms\s*&\s*p\s*500\M' THEN 'markets'
            WHEN v.cleaned_wording ~* 'brain ?teasers?|mental math|market sizing|manhole covers?|probability (question|problem|puzzle)|coin flips?|\mdice\M' THEN 'brainteasers'
            WHEN v.cleaned_wording ~* 'tell me about yourself|why (ib|investment banking|private equity|banking|our firm)|behavioral|tell me about a time|teamwork|\mconflict\M|\mfailure\M|leadership' THEN 'behavioral'
            ELSE 'untagged'
        END AS topic_slug
    FROM canonical.question_occurrences o2
    JOIN canonical.question_variants v ON v.id = o2.question_variant_id
    WHERE coalesce(o2.topic, 'untagged') = 'untagged'
) AS tagged
WHERE o.id = tagged.occurrence_id
  AND tagged.topic_slug <> 'untagged';

-- ---------------------------------------------------------------------------
-- 2) Teaching canonical topic backfill (same rules on canonical_wording)
-- ---------------------------------------------------------------------------
UPDATE canonical.canonical_questions q
SET topic = tagged.topic_slug,
    updated_at = now()
FROM (
    SELECT
        id,
        CASE
            WHEN canonical_wording ~* 'levered fcf|unlevered fcf|how do i get to (levered |unlevered )?fcf|free cash flow' THEN 'valuation'
            WHEN canonical_wording ~* 'stock pitch|pitch (me )?(a |an )?(stock|company|investment)|recent deal' THEN 'investment_thesis'
            WHEN canonical_wording ~* 'recent (news|market|transaction)|market (news|conditions?)|in the news' THEN 'markets'
            WHEN canonical_wording ~* 'walk me through your (resume|cv)|tell me about your (resume|cv)|why .{0,40}(goldman|morgan stanley|jpmorgan|blackstone|kkr|evercore).{0,40}(ib|investment banking|banking|private equity)?|why (did you choose|would you (like to )?work|do you want to (work|join|apply))|where .{0,20}(see yourself|in 5 years)|hobbies|strengths? and weaknesses?|tell me about yourself|why (ib|investment banking|private equity|banking|our firm|this (firm|role|position|company))' THEN 'behavioral'
            WHEN canonical_wording ~* '\mlbo\M|leveraged buyout|paper lbo|\mmoic\M|\mirr\M|debt paydown|cash sweep|sources? and uses?|entry multiple|exit multiple|sponsor returns?|dividend recap|management rollover' THEN 'lbo'
            WHEN canonical_wording ~* '\mdcf\M|discounted cash flow|\mwacc\M|\mcapm\M|comparable compan|\mcomps\M|trading multipl|transaction multipl|precedent transaction|\mvaluation\M|terminal value|gordon growth|perpetuity growth|free cash flow|\mfcf\M|unlevered|\mddm\M|dividend discount model' THEN 'valuation'
            WHEN canonical_wording ~* 'enterprise value|equity value|\mev\M.*\mequity\M|\mequity\M.*\mev\M|net debt|minority interest|preferred stock|treasury stock method|fully diluted shares?' THEN 'enterprise_value'
            WHEN canonical_wording ~* 'working capital|\mnwc\M|accounts? receivable|accounts? payable|cash conversion cycle|inventory turnover' THEN 'working_capital'
            WHEN canonical_wording ~* 'three (financial )?statements|income statement|balance sheet|cash flow statement|depreciation|amortization|\mgaap\M|goodwill|impairment|write-?down|deferred tax|revenue recognition|net income|\mcogs\M|capital expenditure|\mcapex\M' THEN 'accounting'
            WHEN canonical_wording ~* '\mmerger\M|\maccretion\M|\mdilution\M|\mm\s*&\s*a\M|mergers? and acquisitions?|merger model|accretive|dilutive|purchase accounting|pro forma eps|deal synergies' THEN 'merger_models'
            WHEN canonical_wording ~* 'credit analysis|credit facility|debt capacity|\mcovenants?\M|interest coverage|leverage ratio|private credit|leveraged finance|high yield' THEN 'credit'
            WHEN canonical_wording ~* 'capital structure|cost of (debt|equity|capital)|\mleverage\M|debt (vs\.?|versus) equity|convertible debt|preferred equity|\mrevolver\M|term loan|senior debt' THEN 'capital_structure'
            WHEN canonical_wording ~* 'investment thesis|underwrite|would you (invest in|acquire|buy)|stock pitch|investment idea|buy or sell' THEN 'investment_thesis'
            WHEN canonical_wording ~* 'due diligence|\mdd\M|quality of earnings|\mqoe\M|data room|management presentation' THEN 'due_diligence'
            WHEN canonical_wording ~* 'restructur|bankrupt|distressed|chapter 11|liquidation' THEN 'restructuring'
            WHEN canonical_wording ~* '\mreturns?\M|\mmoic\M|\mirr\M|cash-?on-?cash|\mroic\M|hurdle rate' THEN 'returns'
            WHEN canonical_wording ~* 'value creation|operational improve|add-?on acquisition|portfolio company|margin expansion|100-?day plan' THEN 'value_creation'
            WHEN canonical_wording ~* 'industry coverage|coverage group|sector trends?' THEN 'industry_coverage'
            WHEN canonical_wording ~* 'current markets?|market conditions?|yield curve|interest rates?|\mfed\M|inflation|\mmacro\M' THEN 'markets'
            WHEN canonical_wording ~* 'brain ?teasers?|mental math|market sizing|manhole covers?' THEN 'brainteasers'
            WHEN canonical_wording ~* 'tell me about yourself|why (ib|investment banking|private equity|banking|our firm)|behavioral|tell me about a time|teamwork|leadership' THEN 'behavioral'
            ELSE 'untagged'
        END AS topic_slug
    FROM canonical.canonical_questions
    WHERE coalesce(topic, 'untagged') = 'untagged'
) AS tagged
WHERE q.id = tagged.id
  AND tagged.topic_slug <> 'untagged';

-- ---------------------------------------------------------------------------
-- 3) Teaching domain inference from topic (do not invent answers)
-- ---------------------------------------------------------------------------
UPDATE canonical.canonical_questions
SET domain = CASE topic
        WHEN 'lbo' THEN 'pe'
        WHEN 'returns' THEN 'pe'
        WHEN 'value_creation' THEN 'pe'
        WHEN 'investment_thesis' THEN 'pe'
        WHEN 'due_diligence' THEN 'pe'
        WHEN 'credit' THEN 'pe'
        WHEN 'merger_models' THEN 'ib'
        WHEN 'accounting' THEN 'ib'
        WHEN 'valuation' THEN 'ib'
        WHEN 'enterprise_value' THEN 'ib'
        WHEN 'working_capital' THEN 'ib'
        WHEN 'capital_structure' THEN 'ib'
        WHEN 'restructuring' THEN 'ib'
        WHEN 'industry_coverage' THEN 'ib'
        WHEN 'markets' THEN 'ib'
        WHEN 'behavioral' THEN 'both'
        WHEN 'brainteasers' THEN 'both'
        ELSE domain
    END,
    track = CASE topic
        WHEN 'lbo' THEN 'pe'
        WHEN 'returns' THEN 'pe'
        WHEN 'value_creation' THEN 'pe'
        WHEN 'investment_thesis' THEN 'pe'
        WHEN 'due_diligence' THEN 'pe'
        WHEN 'credit' THEN 'pe'
        WHEN 'merger_models' THEN 'ib'
        WHEN 'accounting' THEN 'ib'
        WHEN 'valuation' THEN 'ib'
        WHEN 'enterprise_value' THEN 'ib'
        WHEN 'working_capital' THEN 'ib'
        WHEN 'capital_structure' THEN 'ib'
        WHEN 'restructuring' THEN 'ib'
        WHEN 'industry_coverage' THEN 'ib'
        WHEN 'markets' THEN 'ib'
        WHEN 'behavioral' THEN 'ib'
        WHEN 'brainteasers' THEN 'ib'
        ELSE track
    END,
    updated_at = now()
WHERE publishable = true
  AND topic IS NOT NULL
  AND topic <> 'untagged'
  AND (domain IS NULL OR domain = 'other');

COMMENT ON VIEW published.v_firm_topic_heat IS
  'Mode A firm×topic intensity from tagged Glassdoor occurrences (keyword_rules_v3)';
