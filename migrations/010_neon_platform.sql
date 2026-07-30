-- 010_neon_platform.sql
-- Neon Postgres product schema (ADR 0001). Layers per prompt §16–17.
-- Idempotent: CREATE IF NOT EXISTS. Driver: @neondatabase/serverless (not @vercel/postgres).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS canonical;
CREATE SCHEMA IF NOT EXISTS published;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS admin;

COMMENT ON SCHEMA raw IS 'Source artefacts and crawl evidence';
COMMENT ON SCHEMA staging IS 'Extracted text + legacy bank rows pending normalisation';
COMMENT ON SCHEMA canonical IS 'Deduped teaching Q/A + firm-signal occurrences';
COMMENT ON SCHEMA published IS 'App-facing views only (security_invoker)';
COMMENT ON SCHEMA app IS 'User / study state (Wave 2)';
COMMENT ON SCHEMA admin IS 'Jobs, audits, flags';

-- Source layer
CREATE TABLE IF NOT EXISTS raw.sources (
    id              text PRIMARY KEY,
    name            text NOT NULL UNIQUE,
    family          text NOT NULL
                    CHECK (family IN (
                        'glassdoor', 'github', 'static', 'gemini', 'editorial', 'other'
                    )),
    config_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
    enabled         boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw.source_runs (
    id              text PRIMARY KEY,
    source_id       text NOT NULL REFERENCES raw.sources (id),
    started_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz,
    status          text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'succeeded', 'failed', 'partial')),
    browser_mode    text
                    CHECK (browser_mode IS NULL OR browser_mode IN (
                        'browser', 'bff', 'github_import', 'gemini_enrich', 'bank_seed'
                    )),
    crawl_version   text,
    parser_version  text,
    metrics_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
    message         text
);

CREATE INDEX IF NOT EXISTS ix_source_runs_source_id ON raw.source_runs (source_id);

CREATE TABLE IF NOT EXISTS raw.source_artifacts (
    id                  text PRIMARY KEY,
    source_id           text NOT NULL REFERENCES raw.sources (id),
    source_run_id       text REFERENCES raw.source_runs (id),
    url_or_path         text NOT NULL,
    commit_sha          text,
    retrieved_at        timestamptz,
    raw_html_path       text,
    raw_json_path       text,
    screenshot_path     text,
    network_log_path    text,
    content_hash        text NOT NULL,
    main_content_hash   text,
    parser_version      text NOT NULL,
    access_state        text NOT NULL DEFAULT 'ok',
    session_class       text,
    license_snapshot    text,
    http_metadata_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
    diagnostics_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_source_artifacts_source_id ON raw.source_artifacts (source_id);
CREATE INDEX IF NOT EXISTS ix_source_artifacts_content_hash ON raw.source_artifacts (content_hash);

CREATE TABLE IF NOT EXISTS raw.crawl_failures (
    id                  text PRIMARY KEY,
    source_id           text REFERENCES raw.sources (id),
    source_run_id       text REFERENCES raw.source_runs (id),
    url_or_path         text,
    error_classification text NOT NULL,
    error_message       text NOT NULL,
    diagnostics_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
    retryable           boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_crawl_failures_run ON raw.crawl_failures (source_run_id);

-- Transformation layer
CREATE TABLE IF NOT EXISTS staging.raw_records (
    id                      text PRIMARY KEY,
    source_artifact_id      text NOT NULL REFERENCES raw.source_artifacts (id),
    exact_source_text       text NOT NULL,
    source_selector_or_span text,
    record_type             text NOT NULL,
    extraction_method       text NOT NULL,
    extracted_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    grounding_confidence    double precision NOT NULL DEFAULT 1.0,
    validation_status       text NOT NULL DEFAULT 'not_run',
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_raw_records_artifact ON staging.raw_records (source_artifact_id);

CREATE TABLE IF NOT EXISTS staging.staging_records (
    id                      text PRIMARY KEY,
    source_artifact_id      text REFERENCES raw.source_artifacts (id),
    source_run_id           text REFERENCES raw.source_runs (id),
    legacy_bank_id          text UNIQUE,
    exact_source_text       text NOT NULL,
    source_span_or_path     text,
    extracted_question      text,
    extracted_answer        text,
    process_text            text,
    firm_raw                text,
    role_raw                text,
    office_raw              text,
    interview_stage_raw     text,
    track_raw               text,
    reported_date_raw       text,
    record_type             text NOT NULL DEFAULT 'glassdoor_occurrence'
                            CHECK (record_type IN (
                                'glassdoor_occurrence',
                                'teaching_qa',
                                'exact_question',
                                'paraphrased_question',
                                'process_note',
                                'other'
                            )),
    extraction_confidence   double precision NOT NULL DEFAULT 1.0,
    validation_issues_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
    gemini_labels_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
    bank_payload_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
    scraped_at              timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_staging_records_firm ON staging.staging_records (firm_raw);
CREATE INDEX IF NOT EXISTS ix_staging_records_track ON staging.staging_records (track_raw);
CREATE INDEX IF NOT EXISTS ix_staging_records_run ON staging.staging_records (source_run_id);

CREATE TABLE IF NOT EXISTS staging.normalised_records (
    id                      text PRIMARY KEY,
    staging_record_id       text NOT NULL UNIQUE REFERENCES staging.staging_records (id),
    firm_id                 text,
    role_id                 text,
    office_id               text,
    track                   text,
    interview_round         text,
    reported_date           date,
    topic_slugs             text[] NOT NULL DEFAULT '{}',
    difficulty              text,
    wording_normalised      text,
    wording_hash            text,
    originals_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_normalised_wording_hash ON staging.normalised_records (wording_hash);

CREATE TABLE IF NOT EXISTS staging.validation_results (
    id                      text PRIMARY KEY,
    subject_type            text NOT NULL,
    subject_id              text NOT NULL,
    validator_version       text NOT NULL,
    status                  text NOT NULL
                            CHECK (status IN ('pass', 'fail', 'warn', 'not_run')),
    issues_json             jsonb NOT NULL DEFAULT '[]'::jsonb,
    scores_json             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_validation_subject ON staging.validation_results (subject_type, subject_id);

-- Organisation layer
CREATE TABLE IF NOT EXISTS canonical.firms (
    id              text PRIMARY KEY,
    slug            text NOT NULL UNIQUE,
    name            text NOT NULL,
    parent_firm_id  text REFERENCES canonical.firms (id),
    track_focus     text,
    metadata_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canonical.firm_aliases (
    id              text PRIMARY KEY,
    firm_id         text NOT NULL REFERENCES canonical.firms (id) ON DELETE CASCADE,
    alias           text NOT NULL,
    source          text,
    UNIQUE (firm_id, alias)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_firm_aliases_lower ON canonical.firm_aliases (lower(alias));

CREATE TABLE IF NOT EXISTS canonical.funds (
    id              text PRIMARY KEY,
    firm_id         text REFERENCES canonical.firms (id),
    name            text NOT NULL,
    metadata_json   jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS canonical.offices (
    id              text PRIMARY KEY,
    firm_id         text REFERENCES canonical.firms (id),
    name            text NOT NULL,
    city            text,
    country         text,
    metadata_json   jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS canonical.roles (
    id              text PRIMARY KEY,
    slug            text NOT NULL UNIQUE,
    name            text NOT NULL,
    track           text,
    seniority       text,
    metadata_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canonical.role_aliases (
    id              text PRIMARY KEY,
    role_id         text NOT NULL REFERENCES canonical.roles (id) ON DELETE CASCADE,
    alias           text NOT NULL,
    UNIQUE (role_id, alias)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_role_aliases_lower ON canonical.role_aliases (lower(alias));

-- Question layer
CREATE TABLE IF NOT EXISTS canonical.canonical_questions (
    id                  text PRIMARY KEY,
    canonical_wording   text NOT NULL,
    question_type       text,
    topic               text,
    subtopic            text,
    domain              text,
    track               text,
    pe_strategy         text,
    pe_relevance        text,
    seniority           text,
    difficulty          text,
    review_state        text NOT NULL DEFAULT 'draft'
                        CHECK (review_state IN (
                            'draft', 'staged', 'validated', 'published', 'rejected', 'merged'
                        )),
    normalised_hash     text,
    provenance          text NOT NULL DEFAULT 'github_source'
                        CHECK (provenance IN (
                            'github_source', 'static_seed', 'glassdoor_occurrence',
                            'gemini_synthesised', 'editorial'
                        )),
    publishable         boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_canonical_questions_normalised_hash
    ON canonical.canonical_questions (normalised_hash);
CREATE INDEX IF NOT EXISTS ix_canonical_questions_track
    ON canonical.canonical_questions (track);
CREATE INDEX IF NOT EXISTS ix_canonical_questions_review
    ON canonical.canonical_questions (review_state);
CREATE INDEX IF NOT EXISTS ix_canonical_questions_wording_trgm
    ON canonical.canonical_questions USING gin (canonical_wording gin_trgm_ops);

CREATE TABLE IF NOT EXISTS canonical.question_variants (
    id                      text PRIMARY KEY,
    canonical_question_id   text REFERENCES canonical.canonical_questions (id),
    source_wording          text NOT NULL,
    cleaned_wording         text NOT NULL,
    normalised_hash         text NOT NULL,
    language                text NOT NULL DEFAULT 'en',
    variant_type            text,
    source_artifact_id      text REFERENCES raw.source_artifacts (id),
    legacy_bank_id          text UNIQUE,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_question_variants_canonical
    ON canonical.question_variants (canonical_question_id);
CREATE INDEX IF NOT EXISTS ix_question_variants_hash
    ON canonical.question_variants (normalised_hash);

CREATE TABLE IF NOT EXISTS canonical.question_occurrences (
    id                      text PRIMARY KEY,
    question_variant_id     text REFERENCES canonical.question_variants (id),
    canonical_question_id   text REFERENCES canonical.canonical_questions (id),
    staging_record_id       text REFERENCES staging.staging_records (id),
    legacy_bank_id          text UNIQUE,
    interview_review_id     text,
    firm_id                 text REFERENCES canonical.firms (id),
    employer_raw            text,
    role_id                 text REFERENCES canonical.roles (id),
    role_raw                text,
    office_raw              text,
    round_raw               text,
    track                   text,
    interview_date          date,
    recruiting_cycle        text,
    outcome                 text,
    process_text            text,
    source_id               text NOT NULL,
    confidence              double precision NOT NULL DEFAULT 1.0,
    detail_url              text,
    scraped_at              timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_question_occurrences_firm
    ON canonical.question_occurrences (firm_id);
CREATE INDEX IF NOT EXISTS ix_question_occurrences_canonical
    ON canonical.question_occurrences (canonical_question_id);
CREATE INDEX IF NOT EXISTS ix_question_occurrences_track
    ON canonical.question_occurrences (track);
CREATE INDEX IF NOT EXISTS ix_question_occurrences_employer_raw
    ON canonical.question_occurrences (employer_raw);

CREATE TABLE IF NOT EXISTS canonical.question_relationships (
    id                  text PRIMARY KEY,
    from_question_id    text NOT NULL REFERENCES canonical.canonical_questions (id),
    to_question_id      text NOT NULL REFERENCES canonical.canonical_questions (id),
    relationship_type   text NOT NULL,
    confidence          double precision NOT NULL DEFAULT 1.0,
    reversible          boolean NOT NULL DEFAULT true,
    audit_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (from_question_id, to_question_id, relationship_type)
);

CREATE TABLE IF NOT EXISTS canonical.question_topics (
    question_id         text NOT NULL REFERENCES canonical.canonical_questions (id) ON DELETE CASCADE,
    topic_slug          text NOT NULL,
    confidence          double precision NOT NULL DEFAULT 1.0,
    method              text NOT NULL DEFAULT 'editorial',
    PRIMARY KEY (question_id, topic_slug)
);

CREATE TABLE IF NOT EXISTS canonical.question_firms (
    question_id         text NOT NULL REFERENCES canonical.canonical_questions (id) ON DELETE CASCADE,
    firm_id             text NOT NULL REFERENCES canonical.firms (id) ON DELETE CASCADE,
    relevance           double precision NOT NULL DEFAULT 0.5,
    method              text NOT NULL DEFAULT 'glassdoor_occurrence',
    sample_size         integer NOT NULL DEFAULT 0,
    PRIMARY KEY (question_id, firm_id)
);

CREATE TABLE IF NOT EXISTS canonical.question_roles (
    question_id         text NOT NULL REFERENCES canonical.canonical_questions (id) ON DELETE CASCADE,
    role_id             text NOT NULL REFERENCES canonical.roles (id) ON DELETE CASCADE,
    relevance           double precision NOT NULL DEFAULT 0.5,
    PRIMARY KEY (question_id, role_id)
);

-- Learning content
CREATE TABLE IF NOT EXISTS canonical.concepts (
    id              text PRIMARY KEY,
    slug            text NOT NULL UNIQUE,
    title           text NOT NULL,
    summary         text,
    track           text,
    metadata_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
    publishable     boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canonical.concept_prerequisites (
    concept_id          text NOT NULL REFERENCES canonical.concepts (id) ON DELETE CASCADE,
    prerequisite_id     text NOT NULL REFERENCES canonical.concepts (id) ON DELETE CASCADE,
    PRIMARY KEY (concept_id, prerequisite_id),
    CHECK (concept_id <> prerequisite_id)
);

CREATE TABLE IF NOT EXISTS canonical.concept_firm_weights (
    concept_id      text NOT NULL REFERENCES canonical.concepts (id) ON DELETE CASCADE,
    firm_id         text NOT NULL REFERENCES canonical.firms (id) ON DELETE CASCADE,
    weight          double precision NOT NULL DEFAULT 0.0,
    method          text NOT NULL DEFAULT 'editorial',
    PRIMARY KEY (concept_id, firm_id)
);

CREATE TABLE IF NOT EXISTS canonical.diagrams (
    id              text PRIMARY KEY,
    slug            text NOT NULL UNIQUE,
    title           text NOT NULL,
    diagram_type    text NOT NULL,
    a11y_fallback   text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canonical.diagram_versions (
    id              text PRIMARY KEY,
    diagram_id      text NOT NULL REFERENCES canonical.diagrams (id) ON DELETE CASCADE,
    version         text NOT NULL,
    format          text NOT NULL CHECK (format IN ('mermaid', 'interactive-json')),
    body            text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (diagram_id, version)
);

CREATE TABLE IF NOT EXISTS canonical.learning_resources (
    id              text PRIMARY KEY,
    label           text NOT NULL,
    url             text NOT NULL,
    kind            text NOT NULL CHECK (kind IN ('internal', 'external')),
    provenance      text NOT NULL,
    metadata_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canonical.resource_links (
    id              text PRIMARY KEY,
    resource_id     text NOT NULL REFERENCES canonical.learning_resources (id) ON DELETE CASCADE,
    link_type       text NOT NULL CHECK (link_type IN ('concept', 'question', 'firm')),
    concept_id      text REFERENCES canonical.concepts (id) ON DELETE CASCADE,
    question_id     text REFERENCES canonical.canonical_questions (id) ON DELETE CASCADE,
    firm_id         text REFERENCES canonical.firms (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_resource_links_resource ON canonical.resource_links (resource_id);

-- Answer layer
CREATE TABLE IF NOT EXISTS canonical.answers (
    id                      text PRIMARY KEY,
    canonical_question_id   text NOT NULL REFERENCES canonical.canonical_questions (id),
    concise_answer          text NOT NULL,
    expanded_explanation    text NOT NULL,
    assumptions_json        jsonb NOT NULL DEFAULT '[]'::jsonb,
    calculation_json        jsonb,
    common_mistakes_json    jsonb NOT NULL DEFAULT '[]'::jsonb,
    follow_ups_json         jsonb NOT NULL DEFAULT '[]'::jsonb,
    provenance_type         text NOT NULL,
    source_ids_json         jsonb NOT NULL DEFAULT '[]'::jsonb,
    generator_version       text,
    validator_version       text,
    validation_status       text NOT NULL DEFAULT 'not_run',
    confidence              double precision NOT NULL DEFAULT 0.5,
    difficulty              text,
    references_json         jsonb NOT NULL DEFAULT '[]'::jsonb,
    publishable             boolean NOT NULL DEFAULT false,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_answers_canonical ON canonical.answers (canonical_question_id);

CREATE TABLE IF NOT EXISTS canonical.answer_versions (
    id              text PRIMARY KEY,
    answer_id       text NOT NULL REFERENCES canonical.answers (id) ON DELETE CASCADE,
    version         text NOT NULL,
    body_json       jsonb NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (answer_id, version)
);

CREATE TABLE IF NOT EXISTS canonical.answer_sources (
    id              text PRIMARY KEY,
    answer_id       text NOT NULL REFERENCES canonical.answers (id) ON DELETE CASCADE,
    source_artifact_id text REFERENCES raw.source_artifacts (id),
    provenance      text NOT NULL,
    label           text,
    url             text
);

CREATE TABLE IF NOT EXISTS canonical.answer_validation_results (
    id              text PRIMARY KEY,
    answer_id       text NOT NULL REFERENCES canonical.answers (id) ON DELETE CASCADE,
    validator_version text NOT NULL,
    status          text NOT NULL,
    issues_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- User layer stubs
CREATE TABLE IF NOT EXISTS app.users (
    id              text PRIMARY KEY,
    neon_auth_user_id   text UNIQUE,
    email           text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.user_profiles (
    user_id         text PRIMARY KEY REFERENCES app.users (id) ON DELETE CASCADE,
    display_name    text,
    target_track    text,
    preferences_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS app.bookmarks (
    id              text PRIMARY KEY,
    user_id         text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    question_id     text REFERENCES canonical.canonical_questions (id) ON DELETE CASCADE,
    concept_id      text REFERENCES canonical.concepts (id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_bookmarks_user ON app.bookmarks (user_id);

CREATE TABLE IF NOT EXISTS app.notes (
    id              text PRIMARY KEY,
    user_id         text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    question_id     text REFERENCES canonical.canonical_questions (id),
    body            text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.collections (
    id              text PRIMARY KEY,
    user_id         text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    name            text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.question_attempts (
    id              text PRIMARY KEY,
    user_id         text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    question_id     text NOT NULL REFERENCES canonical.canonical_questions (id),
    response_text   text,
    correctness     double precision,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_question_attempts_user ON app.question_attempts (user_id);

CREATE TABLE IF NOT EXISTS app.confidence_ratings (
    id              text PRIMARY KEY,
    user_id         text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    question_id     text NOT NULL REFERENCES canonical.canonical_questions (id),
    rating          integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.mastery_records (
    id              text PRIMARY KEY,
    user_id         text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    question_id     text REFERENCES canonical.canonical_questions (id),
    concept_id      text REFERENCES canonical.concepts (id),
    mastery         double precision NOT NULL DEFAULT 0.0,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mastery_user_question
    ON app.mastery_records (user_id, question_id) WHERE question_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mastery_user_concept
    ON app.mastery_records (user_id, concept_id) WHERE concept_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.study_sessions (
    id              text PRIMARY KEY,
    user_id         text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    mode            text NOT NULL CHECK (mode IN ('company_prep', 'concept_learn')),
    firm_id         text REFERENCES canonical.firms (id),
    started_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz,
    metadata_json   jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS app.study_session_questions (
    session_id      text NOT NULL REFERENCES app.study_sessions (id) ON DELETE CASCADE,
    question_id     text NOT NULL REFERENCES canonical.canonical_questions (id),
    position        integer NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, question_id)
);

CREATE TABLE IF NOT EXISTS app.study_plans (
    id              text PRIMARY KEY,
    user_id         text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    name            text NOT NULL,
    plan_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.review_queue (
    id              text PRIMARY KEY,
    user_id         text NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
    question_id     text NOT NULL REFERENCES canonical.canonical_questions (id),
    due_at          timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Administration
CREATE TABLE IF NOT EXISTS admin.ingestion_jobs (
    idempotency_key         text PRIMARY KEY,
    job_name                text NOT NULL,
    state                   text NOT NULL,
    started_at              timestamptz,
    completed_at            timestamptz,
    retry_count             integer NOT NULL DEFAULT 0,
    error_classification    text,
    input_count             integer NOT NULL DEFAULT 0,
    output_count            integer NOT NULL DEFAULT 0,
    parser_or_model_version text,
    resume_checkpoint_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
    metrics_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
    message                 text
);

CREATE TABLE IF NOT EXISTS admin.dead_letters (
    id                      text PRIMARY KEY,
    job_name                text NOT NULL,
    idempotency_key         text NOT NULL,
    error_classification    text NOT NULL,
    error_message           text NOT NULL,
    payload_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    retryable               boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS admin.merge_decisions (
    id              text PRIMARY KEY,
    survivor_id     text NOT NULL,
    merged_id       text NOT NULL,
    reason          text,
    reversible      boolean NOT NULL DEFAULT true,
    payload_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.review_tasks (
    id              text PRIMARY KEY,
    subject_type    text NOT NULL,
    subject_id      text NOT NULL,
    status          text NOT NULL DEFAULT 'open',
    assignee        text,
    payload_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.audit_events (
    id              text PRIMARY KEY,
    actor           text,
    action          text NOT NULL,
    subject_type    text,
    subject_id      text,
    payload_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_events_created ON admin.audit_events (created_at DESC);

CREATE TABLE IF NOT EXISTS admin.feature_flags (
    key             text PRIMARY KEY,
    enabled         boolean NOT NULL DEFAULT false,
    config_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO raw.sources (id, name, family, config_json)
VALUES
    ('src_glassdoor_bank', 'glassdoor_question_bank', 'glassdoor',
     '{"lineage":"glasscleaner2_question_bank","role":"firm_signal"}'::jsonb),
    ('src_github_corpus', 'github_teaching_qa', 'github',
     '{"role":"teaching_qa"}'::jsonb),
    ('src_static_seed', 'static_seed', 'static',
     '{"role":"teaching_qa"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
