-- 040_diagram_coverage_expand.sql
-- Expand Mode B mermaid diagram coverage for core concepts (C10).
-- Also allow rag_documents.kind = diagram for a11y embedding.

ALTER TABLE canonical.rag_documents
  DROP CONSTRAINT IF EXISTS rag_documents_kind_check;

ALTER TABLE canonical.rag_documents
  ADD CONSTRAINT rag_documents_kind_check
  CHECK (kind IN (
    'canonical_question', 'concept', 'resource', 'answer_chunk', 'diagram'
  ));

INSERT INTO canonical.diagrams (id, slug, title, diagram_type, a11y_fallback)
VALUES
    (
        'diag_wacc_build',
        'wacc-build-up',
        'WACC build-up',
        'finance-flow',
        'WACC blends cost of equity and after-tax cost of debt by target capital structure weights.'
    ),
    (
        'diag_accretion_dilution',
        'accretion-dilution',
        'Accretion and dilution',
        'finance-flow',
        'Compare pro-forma EPS with standalone EPS. Accretive if pro-forma EPS rises; dilutive if it falls.'
    ),
    (
        'diag_moic_irr',
        'moic-irr',
        'MOIC and IRR',
        'finance-flow',
        'MOIC is exit equity over entry equity. IRR annualises that multiple over the hold period.'
    ),
    (
        'diag_paper_lbo_returns',
        'paper-lbo-returns',
        'Paper LBO returns bridge',
        'finance-flow',
        'Entry equity, debt paydown, EBITDA growth, and exit multiple change bridge to exit equity and MOIC/IRR.'
    )
ON CONFLICT (id) DO NOTHING;

INSERT INTO canonical.diagram_versions (id, diagram_id, version, format, body)
VALUES
    (
        'diag_wacc_build_v1',
        'diag_wacc_build',
        '1',
        'mermaid',
        $m$flowchart LR
  Re[Cost of equity] --> WACC[WACC]
  Rd[After-tax cost of debt] --> WACC
  W[E/V and D/V weights] --> WACC
  WACC --> Discount[Discount UFCF]$m$
    ),
    (
        'diag_accretion_dilution_v1',
        'diag_accretion_dilution',
        '1',
        'mermaid',
        $m$flowchart TB
  Standalone[Standalone EPS] --> Compare{Compare}
  ProForma[Pro-forma EPS] --> Compare
  Compare -->|Higher| Acc[Accretive]
  Compare -->|Lower| Dil[Dilutive]$m$
    ),
    (
        'diag_moic_irr_v1',
        'diag_moic_irr',
        '1',
        'mermaid',
        $m$flowchart LR
  Entry[Entry equity] --> MOIC[MOIC = Exit / Entry]
  Exit[Exit equity] --> MOIC
  MOIC --> IRR[IRR ≈ MOIC^(1/n) - 1]$m$
    ),
    (
        'diag_paper_lbo_returns_v1',
        'diag_paper_lbo_returns',
        '1',
        'mermaid',
        $m$flowchart TB
  EntryEq[Entry equity] --> Bridge[Returns bridge]
  Delev[Debt paydown] --> Bridge
  Ebitda[EBITDA growth] --> Bridge
  Mult[Exit multiple] --> Bridge
  Bridge --> ExitEq[Exit equity]
  ExitEq --> Returns[MOIC and IRR]$m$
    )
ON CONFLICT (id) DO NOTHING;

-- Attach diagram checkpoints (idempotent by checkpoint id).
INSERT INTO canonical.learning_module_checkpoints (
    id, module_id, kind, title, position, concept_id, diagram_id, question_ids
)
VALUES
    (
        'chk_dcf_wacc_diagram',
        'module_dcf_wacc',
        'diagram',
        'WACC build-up diagram',
        3,
        'concept_dcf_wacc',
        'diag_wacc_build',
        '[]'::jsonb
    ),
    (
        'chk_lbo_moic_diagram',
        'module_lbo_paper_lbo',
        'diagram',
        'MOIC and IRR diagram',
        4,
        'concept_lbo_paper_lbo',
        'diag_moic_irr',
        '[]'::jsonb
    ),
    (
        'chk_lbo_returns_diagram',
        'module_lbo_paper_lbo',
        'diagram',
        'Paper LBO returns bridge',
        5,
        'concept_lbo_paper_lbo',
        'diag_paper_lbo_returns',
        '[]'::jsonb
    )
ON CONFLICT (id) DO NOTHING;
