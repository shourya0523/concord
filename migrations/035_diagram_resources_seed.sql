-- 035_diagram_resources_seed.sql
-- Complete the Mode B asset graph: three-statement diagram for the accounting
-- concept (DB had 3 diagrams; accounting module had none) and editorial
-- learning resources linked to concepts.

INSERT INTO canonical.diagrams (id, slug, title, diagram_type, a11y_fallback)
VALUES (
    'diag_three_statement',
    'three-statement-linkages',
    'Three-statement linkages',
    'finance-flow',
    'Net income flows from the income statement into the cash flow statement and retained earnings on the balance sheet. Ending cash from the cash flow statement updates the balance sheet cash line.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO canonical.diagram_versions (id, diagram_id, version, format, body)
VALUES (
    'diag_three_statement_v1',
    'diag_three_statement',
    1,
    'mermaid',
    'flowchart TB
  IS[Income statement] -->|Net income| CFS[Cash flow statement]
  IS -->|Retained earnings| BS[Balance sheet]
  CFS -->|Ending cash| BS'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO canonical.learning_resources (id, label, url, kind, provenance, metadata_json)
VALUES
    (
        'res_damodaran_wacc',
        'Damodaran — cost of capital data',
        'https://pages.stern.nyu.edu/~adamodar/',
        'external',
        'editorial',
        '{"why": "Reference WACC inputs by industry for DCF labs."}'::jsonb
    ),
    (
        'res_macabacus_lbo',
        'Macabacus — LBO returns primer',
        'https://macabacus.com/valuation/lbo/overview',
        'external',
        'editorial',
        '{"why": "Paper LBO mechanics and returns drivers."}'::jsonb
    ),
    (
        'res_mergers_inquisitions_ev',
        'M&I — enterprise value vs equity value',
        'https://mergersandinquisitions.com/enterprise-value-vs-equity-value/',
        'external',
        'editorial',
        '{"why": "Bridge walkthrough with claims detail."}'::jsonb
    ),
    (
        'res_wallstreetoasis_accounting',
        'Three-statement interview drill sheet',
        'https://www.wallstreetoasis.com/resources/skills/financial-modeling/three-statement-model',
        'external',
        'editorial',
        '{"why": "Statement articulation practice for accounting foundations."}'::jsonb
    )
ON CONFLICT (id) DO NOTHING;

INSERT INTO canonical.resource_links (id, resource_id, link_type, concept_id, question_id, firm_id)
VALUES
    ('rl_damodaran_dcf', 'res_damodaran_wacc', 'concept', 'concept_dcf_wacc', NULL, NULL),
    ('rl_macabacus_lbo', 'res_macabacus_lbo', 'concept', 'concept_lbo_paper_lbo', NULL, NULL),
    ('rl_mi_ev', 'res_mergers_inquisitions_ev', 'concept', 'concept_ev_equity_value', NULL, NULL),
    ('rl_wso_accounting', 'res_wallstreetoasis_accounting', 'concept', 'concept_accounting_foundations', NULL, NULL)
ON CONFLICT (id) DO NOTHING;
