-- 032_learning_flows.sql
-- Concord learning/app flow gaps from DESIGN.md: modules, checkpoints, targets, progress, collections.

CREATE TABLE IF NOT EXISTS canonical.learning_modules (
    id                  text PRIMARY KEY,
    slug                text NOT NULL UNIQUE,
    title               text NOT NULL,
    summary             text,
    track               text,
    domain              text,
    estimated_minutes   integer CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
    metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
    publishable         boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_learning_modules_track
    ON canonical.learning_modules (track);
CREATE INDEX IF NOT EXISTS ix_learning_modules_domain
    ON canonical.learning_modules (domain);
CREATE INDEX IF NOT EXISTS ix_learning_modules_publishable
    ON canonical.learning_modules (publishable);

CREATE TABLE IF NOT EXISTS canonical.learning_module_checkpoints (
    id                  text PRIMARY KEY,
    module_id           text NOT NULL REFERENCES canonical.learning_modules (id) ON DELETE CASCADE,
    kind                text NOT NULL CHECK (kind IN ('lesson', 'concept_lab', 'drill', 'quiz', 'diagram')),
    title               text NOT NULL,
    position            integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    concept_id          text REFERENCES canonical.concepts (id) ON DELETE SET NULL,
    diagram_id          text REFERENCES canonical.diagrams (id) ON DELETE SET NULL,
    question_ids        jsonb NOT NULL DEFAULT '[]'::jsonb
                        CHECK (jsonb_typeof(question_ids) = 'array'),
    body_markdown       text,
    metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_learning_module_checkpoints_module
    ON canonical.learning_module_checkpoints (module_id, position);
CREATE INDEX IF NOT EXISTS ix_learning_module_checkpoints_concept
    ON canonical.learning_module_checkpoints (concept_id);
CREATE INDEX IF NOT EXISTS ix_learning_module_checkpoints_diagram
    ON canonical.learning_module_checkpoints (diagram_id);

CREATE TABLE IF NOT EXISTS canonical.learning_module_prerequisites (
    module_id                   text NOT NULL REFERENCES canonical.learning_modules (id) ON DELETE CASCADE,
    prerequisite_module_id      text NOT NULL REFERENCES canonical.learning_modules (id) ON DELETE CASCADE,
    PRIMARY KEY (module_id, prerequisite_module_id),
    CHECK (module_id <> prerequisite_module_id)
);

CREATE TABLE IF NOT EXISTS canonical.learning_module_concepts (
    module_id           text NOT NULL REFERENCES canonical.learning_modules (id) ON DELETE CASCADE,
    concept_id          text NOT NULL REFERENCES canonical.concepts (id) ON DELETE CASCADE,
    PRIMARY KEY (module_id, concept_id)
);

CREATE INDEX IF NOT EXISTS ix_learning_module_concepts_concept
    ON canonical.learning_module_concepts (concept_id);

CREATE TABLE IF NOT EXISTS app.target_company_sets (
    user_id             text PRIMARY KEY REFERENCES app.users (id) ON DELETE CASCADE,
    firm_ids            jsonb NOT NULL DEFAULT '[]'::jsonb
                        CHECK (jsonb_typeof(firm_ids) = 'array'),
    primary_firm_id     text REFERENCES canonical.firms (id) ON DELETE SET NULL,
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_target_company_sets_primary_firm
    ON app.target_company_sets (primary_firm_id);

CREATE TABLE IF NOT EXISTS app.module_progress (
    user_id                     text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    module_id                   text NOT NULL REFERENCES canonical.learning_modules (id) ON DELETE CASCADE,
    completed_checkpoint_ids    jsonb NOT NULL DEFAULT '[]'::jsonb
                                CHECK (jsonb_typeof(completed_checkpoint_ids) = 'array'),
    percent                     double precision NOT NULL DEFAULT 0.0
                                CHECK (percent >= 0.0 AND percent <= 100.0),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, module_id)
);

CREATE INDEX IF NOT EXISTS ix_module_progress_module
    ON app.module_progress (module_id);

CREATE TABLE IF NOT EXISTS app.collection_items (
    id              text PRIMARY KEY,
    collection_id   text NOT NULL REFERENCES app.collections (id) ON DELETE CASCADE,
    question_id     text REFERENCES canonical.canonical_questions (id) ON DELETE CASCADE,
    concept_id      text REFERENCES canonical.concepts (id) ON DELETE CASCADE,
    module_id       text REFERENCES canonical.learning_modules (id) ON DELETE CASCADE,
    position        integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (num_nonnulls(question_id, concept_id, module_id) = 1)
);

CREATE INDEX IF NOT EXISTS ix_collections_user
    ON app.collections (user_id);
CREATE INDEX IF NOT EXISTS ix_collection_items_collection
    ON app.collection_items (collection_id, position);
CREATE INDEX IF NOT EXISTS ix_collection_items_module
    ON app.collection_items (module_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_items_question
    ON app.collection_items (collection_id, question_id)
    WHERE question_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_items_concept
    ON app.collection_items (collection_id, concept_id)
    WHERE concept_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_items_module
    ON app.collection_items (collection_id, module_id)
    WHERE module_id IS NOT NULL;

ALTER TABLE app.study_sessions
    DROP CONSTRAINT IF EXISTS study_sessions_mode_check;
ALTER TABLE app.study_sessions
    ADD CONSTRAINT study_sessions_mode_check
    CHECK (mode IN (
        'company_prep',
        'concept_learn',
        'company',
        'concept',
        'adaptive_weak',
        'pseudo_rag',
        'simulator'
    ));

COMMENT ON COLUMN app.study_sessions.mode IS
    'Practice mode; includes simulator for DESIGN.md interview simulations.';
COMMENT ON COLUMN app.study_plans.plan_json IS
    'Flexible study-plan payload; may include module/checkpoint assignment items.';
COMMENT ON TABLE canonical.learning_modules IS
    'Published curriculum modules for Mode B learning and Mode A study plans.';
COMMENT ON TABLE canonical.learning_module_checkpoints IS
    'Ordered module lessons, concept labs, drills, quizzes, and diagram checkpoints.';
COMMENT ON TABLE app.target_company_sets IS
    'Per-user selected target firms, matching TargetCompanySet.firm_ids.';
COMMENT ON TABLE app.module_progress IS
    'Per-user learning module completion state.';
COMMENT ON TABLE app.collection_items IS
    'Items saved into user collections: question, concept, or learning module.';

CREATE OR REPLACE VIEW published.v_learning_modules
WITH (security_invoker = true) AS
SELECT
    m.id,
    m.slug,
    m.title,
    m.summary,
    m.track,
    m.domain,
    m.estimated_minutes,
    m.metadata_json,
    m.created_at,
    m.updated_at,
    coalesce(
        jsonb_agg(DISTINCT c.slug) FILTER (WHERE c.slug IS NOT NULL),
        '[]'::jsonb
    ) AS concept_slugs,
    coalesce(
        jsonb_agg(DISTINCT p.prerequisite_module_id) FILTER (
            WHERE p.prerequisite_module_id IS NOT NULL
        ),
        '[]'::jsonb
    ) AS prerequisite_module_ids
FROM canonical.learning_modules m
LEFT JOIN canonical.learning_module_concepts mc ON mc.module_id = m.id
LEFT JOIN canonical.concepts c ON c.id = mc.concept_id
LEFT JOIN canonical.learning_module_prerequisites p ON p.module_id = m.id
WHERE m.publishable = true
GROUP BY
    m.id,
    m.slug,
    m.title,
    m.summary,
    m.track,
    m.domain,
    m.estimated_minutes,
    m.metadata_json,
    m.created_at,
    m.updated_at;

CREATE OR REPLACE VIEW published.v_learning_module_checkpoints
WITH (security_invoker = true) AS
SELECT
    cp.id,
    cp.module_id,
    m.slug AS module_slug,
    cp.kind,
    cp.title,
    cp.position,
    cp.concept_id,
    c.slug AS concept_slug,
    cp.diagram_id,
    cp.question_ids,
    cp.body_markdown,
    cp.metadata_json,
    cp.created_at,
    cp.updated_at
FROM canonical.learning_module_checkpoints cp
JOIN canonical.learning_modules m ON m.id = cp.module_id
LEFT JOIN canonical.concepts c ON c.id = cp.concept_id
WHERE m.publishable = true;

GRANT SELECT ON published.v_learning_modules TO PUBLIC;
GRANT SELECT ON published.v_learning_module_checkpoints TO PUBLIC;

ALTER TABLE canonical.learning_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical.learning_module_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical.learning_module_prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical.learning_module_concepts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_modules_published_read ON canonical.learning_modules;
CREATE POLICY learning_modules_published_read ON canonical.learning_modules
    FOR SELECT
    USING (publishable = true);

DROP POLICY IF EXISTS learning_module_checkpoints_published_read
    ON canonical.learning_module_checkpoints;
CREATE POLICY learning_module_checkpoints_published_read
    ON canonical.learning_module_checkpoints
    FOR SELECT
    USING (
        module_id IN (
            SELECT id FROM canonical.learning_modules
            WHERE publishable = true
        )
    );

DROP POLICY IF EXISTS learning_module_prerequisites_published_read
    ON canonical.learning_module_prerequisites;
CREATE POLICY learning_module_prerequisites_published_read
    ON canonical.learning_module_prerequisites
    FOR SELECT
    USING (
        module_id IN (
            SELECT id FROM canonical.learning_modules
            WHERE publishable = true
        )
        AND prerequisite_module_id IN (
            SELECT id FROM canonical.learning_modules
            WHERE publishable = true
        )
    );

DROP POLICY IF EXISTS learning_module_concepts_published_read
    ON canonical.learning_module_concepts;
CREATE POLICY learning_module_concepts_published_read
    ON canonical.learning_module_concepts
    FOR SELECT
    USING (
        module_id IN (
            SELECT id FROM canonical.learning_modules
            WHERE publishable = true
        )
    );

ALTER TABLE app.target_company_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.module_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.collection_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.target_company_sets FORCE ROW LEVEL SECURITY;
ALTER TABLE app.module_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE app.collection_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_collections_self ON app.collections;
CREATE POLICY app_collections_self ON app.collections
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

DROP POLICY IF EXISTS app_target_company_sets_self ON app.target_company_sets;
CREATE POLICY app_target_company_sets_self ON app.target_company_sets
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

DROP POLICY IF EXISTS app_module_progress_self ON app.module_progress;
CREATE POLICY app_module_progress_self ON app.module_progress
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

DROP POLICY IF EXISTS app_collection_items_self ON app.collection_items;
CREATE POLICY app_collection_items_self ON app.collection_items
    FOR ALL
    USING (
        collection_id IN (
            SELECT c.id
            FROM app.collections c
            JOIN app.users u ON u.id = c.user_id
            WHERE u.neon_auth_user_id = nullif(current_setting('app.neon_auth_user_id', true), '')
        )
    )
    WITH CHECK (
        collection_id IN (
            SELECT c.id
            FROM app.collections c
            JOIN app.users u ON u.id = c.user_id
            WHERE u.neon_auth_user_id = nullif(current_setting('app.neon_auth_user_id', true), '')
        )
    );

INSERT INTO canonical.concepts (id, slug, title, summary, track, metadata_json, publishable)
VALUES
    (
        'concept_accounting_foundations',
        'accounting-foundations',
        'Accounting Foundations',
        'Three statements, accruals, working capital, and common interview adjustments.',
        'IB',
        '{"domain":"ib","seed":"032_learning_flows"}'::jsonb,
        true
    ),
    (
        'concept_ev_equity_value',
        'ev-equity-value',
        'Enterprise Value and Equity Value',
        'Bridge market value, net debt, minority interest, associates, and operating assets.',
        'IB',
        '{"domain":"ib","seed":"032_learning_flows"}'::jsonb,
        true
    ),
    (
        'concept_dcf_wacc',
        'dcf-wacc',
        'DCF and WACC',
        'Forecast free cash flow, terminal value, discount rates, and sensitivity framing.',
        'IB',
        '{"domain":"ib","seed":"032_learning_flows"}'::jsonb,
        true
    ),
    (
        'concept_lbo_paper_lbo',
        'lbo-paper-lbo',
        'LBO and Paper LBO',
        'Entry value, leverage, cash sweep, exit multiple, and returns math.',
        'PE',
        '{"domain":"pe","seed":"032_learning_flows"}'::jsonb,
        true
    ),
    (
        'concept_behavioural_story',
        'behavioural-story',
        'Behavioural Story',
        'Personal story, motivation, deal narrative, and fit answers.',
        'IB',
        '{"domain":"both","seed":"032_learning_flows"}'::jsonb,
        true
    )
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    track = EXCLUDED.track,
    metadata_json = concepts.metadata_json || EXCLUDED.metadata_json,
    publishable = EXCLUDED.publishable,
    updated_at = now();

INSERT INTO canonical.diagrams (id, slug, title, diagram_type, a11y_fallback)
VALUES
    (
        'diag_ev_bridge',
        'ev-equity-bridge',
        'EV to Equity Bridge',
        'finance-flow',
        'Enterprise value plus non-operating assets minus net debt and claims equals equity value.'
    ),
    (
        'diag_dcf_wacc',
        'dcf-wacc-flow',
        'DCF and WACC Flow',
        'finance-flow',
        'Free cash flows and terminal value are discounted at WACC to enterprise value.'
    ),
    (
        'diag_lbo_sources_uses',
        'lbo-sources-uses',
        'LBO Sources and Uses',
        'finance-flow',
        'Purchase price and fees are funded by debt, sponsor equity, and rollover sources.'
    )
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    diagram_type = EXCLUDED.diagram_type,
    a11y_fallback = EXCLUDED.a11y_fallback;

INSERT INTO canonical.diagram_versions (id, diagram_id, version, format, body)
VALUES
    (
        'diagv_ev_bridge_v1',
        'diag_ev_bridge',
        'v1',
        'mermaid',
        'flowchart LR; EV[Enterprise Value] --> Debt[Subtract Net Debt]; Debt --> Equity[Equity Value]'
    ),
    (
        'diagv_dcf_wacc_v1',
        'diag_dcf_wacc',
        'v1',
        'mermaid',
        'flowchart LR; FCF[Free Cash Flow] --> TV[Terminal Value]; TV --> WACC[Discount at WACC]; WACC --> EV[Enterprise Value]'
    ),
    (
        'diagv_lbo_sources_uses_v1',
        'diag_lbo_sources_uses',
        'v1',
        'mermaid',
        'flowchart LR; Uses[Purchase Price and Fees] --> Sources[Debt plus Sponsor Equity]; Sources --> Returns[Exit Equity Value]'
    )
ON CONFLICT (diagram_id, version) DO UPDATE SET
    format = EXCLUDED.format,
    body = EXCLUDED.body;

INSERT INTO canonical.learning_modules (
    id, slug, title, summary, track, domain, estimated_minutes, metadata_json, publishable
)
VALUES
    (
        'module_accounting_foundations',
        'accounting-foundations',
        'Accounting Foundations',
        'Build the three-statement base required for technical interview answers.',
        'IB',
        'ib',
        45,
        '{"seed":"032_learning_flows","level":"foundation"}'::jsonb,
        true
    ),
    (
        'module_ev_equity_value',
        'ev-equity-value',
        'EV and Equity Value',
        'Learn the bridge between enterprise value, equity value, and claims.',
        'IB',
        'ib',
        35,
        '{"seed":"032_learning_flows","level":"foundation"}'::jsonb,
        true
    ),
    (
        'module_dcf_wacc',
        'dcf-wacc',
        'DCF and WACC',
        'Turn forecasts into value with WACC, terminal value, and sensitivities.',
        'IB',
        'ib',
        55,
        '{"seed":"032_learning_flows","level":"core"}'::jsonb,
        true
    ),
    (
        'module_lbo_paper_lbo',
        'lbo-paper-lbo',
        'LBO and Paper LBO',
        'Practice sponsor returns math and paper LBO shortcuts.',
        'PE',
        'pe',
        60,
        '{"seed":"032_learning_flows","level":"core"}'::jsonb,
        true
    ),
    (
        'module_behavioural_story',
        'behavioural-story',
        'Behavioural Story',
        'Shape fit, motivation, and deal stories for banking and PE interviews.',
        'IB',
        'both',
        30,
        '{"seed":"032_learning_flows","level":"foundation"}'::jsonb,
        true
    )
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    track = EXCLUDED.track,
    domain = EXCLUDED.domain,
    estimated_minutes = EXCLUDED.estimated_minutes,
    metadata_json = learning_modules.metadata_json || EXCLUDED.metadata_json,
    publishable = EXCLUDED.publishable,
    updated_at = now();

INSERT INTO canonical.learning_module_prerequisites (module_id, prerequisite_module_id)
VALUES
    ('module_ev_equity_value', 'module_accounting_foundations'),
    ('module_dcf_wacc', 'module_accounting_foundations'),
    ('module_lbo_paper_lbo', 'module_accounting_foundations'),
    ('module_lbo_paper_lbo', 'module_ev_equity_value'),
    ('module_lbo_paper_lbo', 'module_dcf_wacc')
ON CONFLICT (module_id, prerequisite_module_id) DO NOTHING;

INSERT INTO canonical.learning_module_concepts (module_id, concept_id)
SELECT 'module_accounting_foundations', id
FROM canonical.concepts
WHERE slug = 'accounting-foundations'
ON CONFLICT (module_id, concept_id) DO NOTHING;

INSERT INTO canonical.learning_module_concepts (module_id, concept_id)
SELECT 'module_ev_equity_value', id
FROM canonical.concepts
WHERE slug = 'ev-equity-value'
ON CONFLICT (module_id, concept_id) DO NOTHING;

INSERT INTO canonical.learning_module_concepts (module_id, concept_id)
SELECT 'module_dcf_wacc', id
FROM canonical.concepts
WHERE slug = 'dcf-wacc'
ON CONFLICT (module_id, concept_id) DO NOTHING;

INSERT INTO canonical.learning_module_concepts (module_id, concept_id)
SELECT 'module_lbo_paper_lbo', id
FROM canonical.concepts
WHERE slug = 'lbo-paper-lbo'
ON CONFLICT (module_id, concept_id) DO NOTHING;

INSERT INTO canonical.learning_module_concepts (module_id, concept_id)
SELECT 'module_behavioural_story', id
FROM canonical.concepts
WHERE slug = 'behavioural-story'
ON CONFLICT (module_id, concept_id) DO NOTHING;

INSERT INTO canonical.learning_module_checkpoints (
    id, module_id, kind, title, position, concept_id, diagram_id, question_ids, body_markdown, metadata_json
)
VALUES
    (
        'chk_accounting_lesson',
        'module_accounting_foundations',
        'lesson',
        'Three statements and accrual logic',
        1,
        (SELECT id FROM canonical.concepts WHERE slug = 'accounting-foundations'),
        NULL,
        '[]'::jsonb,
        'Start with how income statement profit connects to cash flow and balance sheet accounts.',
        '{"seed":"032_learning_flows"}'::jsonb
    ),
    (
        'chk_accounting_drill',
        'module_accounting_foundations',
        'drill',
        'Working capital and depreciation drill',
        2,
        (SELECT id FROM canonical.concepts WHERE slug = 'accounting-foundations'),
        NULL,
        '[]'::jsonb,
        NULL,
        '{"seed":"032_learning_flows","drill_type":"active_recall"}'::jsonb
    ),
    (
        'chk_ev_lesson',
        'module_ev_equity_value',
        'lesson',
        'EV versus equity value',
        1,
        (SELECT id FROM canonical.concepts WHERE slug = 'ev-equity-value'),
        NULL,
        '[]'::jsonb,
        'Separate operating asset value from equity value available to common shareholders.',
        '{"seed":"032_learning_flows"}'::jsonb
    ),
    (
        'chk_ev_diagram',
        'module_ev_equity_value',
        'diagram',
        'EV to equity bridge',
        2,
        (SELECT id FROM canonical.concepts WHERE slug = 'ev-equity-value'),
        'diag_ev_bridge',
        '[]'::jsonb,
        NULL,
        '{"seed":"032_learning_flows"}'::jsonb
    ),
    (
        'chk_dcf_lesson',
        'module_dcf_wacc',
        'lesson',
        'Forecasts, WACC, and terminal value',
        1,
        (SELECT id FROM canonical.concepts WHERE slug = 'dcf-wacc'),
        NULL,
        '[]'::jsonb,
        'A DCF converts forecast free cash flow and terminal value into enterprise value.',
        '{"seed":"032_learning_flows"}'::jsonb
    ),
    (
        'chk_dcf_diagram',
        'module_dcf_wacc',
        'diagram',
        'DCF flow diagram',
        2,
        (SELECT id FROM canonical.concepts WHERE slug = 'dcf-wacc'),
        'diag_dcf_wacc',
        '[]'::jsonb,
        NULL,
        '{"seed":"032_learning_flows"}'::jsonb
    ),
    (
        'chk_lbo_concept_lab',
        'module_lbo_paper_lbo',
        'concept_lab',
        'Paper LBO returns lab',
        1,
        (SELECT id FROM canonical.concepts WHERE slug = 'lbo-paper-lbo'),
        'diag_lbo_sources_uses',
        '[]'::jsonb,
        NULL,
        '{"seed":"032_learning_flows","lab":"paper_lbo"}'::jsonb
    ),
    (
        'chk_lbo_quiz',
        'module_lbo_paper_lbo',
        'quiz',
        'LBO returns quiz',
        2,
        (SELECT id FROM canonical.concepts WHERE slug = 'lbo-paper-lbo'),
        NULL,
        '[]'::jsonb,
        NULL,
        '{"seed":"032_learning_flows"}'::jsonb
    ),
    (
        'chk_behavioural_lesson',
        'module_behavioural_story',
        'lesson',
        'Personal story structure',
        1,
        (SELECT id FROM canonical.concepts WHERE slug = 'behavioural-story'),
        NULL,
        '[]'::jsonb,
        'Use a concise arc: context, choice, evidence, and why this seat now.',
        '{"seed":"032_learning_flows"}'::jsonb
    ),
    (
        'chk_behavioural_drill',
        'module_behavioural_story',
        'drill',
        'Why this firm and why this role',
        2,
        (SELECT id FROM canonical.concepts WHERE slug = 'behavioural-story'),
        NULL,
        '[]'::jsonb,
        NULL,
        '{"seed":"032_learning_flows","drill_type":"spoken_prompt"}'::jsonb
    )
ON CONFLICT (id) DO UPDATE SET
    module_id = EXCLUDED.module_id,
    kind = EXCLUDED.kind,
    title = EXCLUDED.title,
    position = EXCLUDED.position,
    concept_id = EXCLUDED.concept_id,
    diagram_id = EXCLUDED.diagram_id,
    question_ids = EXCLUDED.question_ids,
    body_markdown = EXCLUDED.body_markdown,
    metadata_json = learning_module_checkpoints.metadata_json || EXCLUDED.metadata_json,
    updated_at = now();
