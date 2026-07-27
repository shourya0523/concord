-- 001_init.sql
-- Additive SQL mirror of SQLAlchemy tables in src/ibpe_corpus/storage/db.py
-- SQLite dialect. Safe to apply once on an empty database.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS source_artefacts (
    id TEXT PRIMARY KEY,
    source_family TEXT NOT NULL,
    url_or_path TEXT NOT NULL,
    commit_sha TEXT,
    retrieved_at TEXT,
    raw_html_path TEXT,
    raw_json_path TEXT,
    screenshot_path TEXT,
    network_log_path TEXT,
    content_hash TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    access_state TEXT NOT NULL,
    session_class TEXT,
    metadata_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS raw_records (
    id TEXT PRIMARY KEY,
    source_artefact_id TEXT NOT NULL,
    exact_source_text TEXT NOT NULL,
    source_selector_or_span TEXT,
    record_type TEXT NOT NULL,
    extraction_method TEXT NOT NULL,
    extracted_metadata_json TEXT DEFAULT '{}',
    grounding_confidence REAL DEFAULT 1.0,
    validation_status TEXT DEFAULT 'not_run'
);

CREATE TABLE IF NOT EXISTS canonical_questions (
    id TEXT PRIMARY KEY,
    canonical_wording TEXT NOT NULL,
    question_type TEXT,
    topic TEXT,
    subtopic TEXT,
    domain TEXT,
    pe_strategy TEXT,
    pe_relevance TEXT,
    seniority TEXT,
    difficulty TEXT,
    review_state TEXT,
    normalised_hash TEXT
);

CREATE INDEX IF NOT EXISTS ix_canonical_questions_normalised_hash
    ON canonical_questions (normalised_hash);

CREATE TABLE IF NOT EXISTS question_variants (
    id TEXT PRIMARY KEY,
    canonical_question_id TEXT NOT NULL,
    source_wording TEXT NOT NULL,
    cleaned_wording TEXT NOT NULL,
    normalised_hash TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    variant_type TEXT,
    source_artefact_id TEXT
);

CREATE INDEX IF NOT EXISTS ix_question_variants_canonical_question_id
    ON question_variants (canonical_question_id);

CREATE INDEX IF NOT EXISTS ix_question_variants_normalised_hash
    ON question_variants (normalised_hash);

CREATE TABLE IF NOT EXISTS interview_occurrences (
    id TEXT PRIMARY KEY,
    question_variant_id TEXT NOT NULL,
    interview_review_id TEXT,
    employer TEXT,
    employer_id TEXT,
    role TEXT,
    office TEXT,
    round TEXT,
    interview_date TEXT,
    recruiting_cycle TEXT,
    outcome TEXT,
    source_id TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    detail_url TEXT
);

CREATE TABLE IF NOT EXISTS question_responses (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    source_response_id TEXT,
    response_type TEXT NOT NULL,
    exact_source_text TEXT NOT NULL,
    source_provided INTEGER DEFAULT 1,
    posted_date TEXT,
    helpful_metadata_json TEXT DEFAULT '{}',
    classification_confidence REAL DEFAULT 0.5,
    parent_response_id TEXT,
    source_url TEXT,
    access_state TEXT,
    source_artefact_id TEXT
);

CREATE TABLE IF NOT EXISTS answers (
    id TEXT PRIMARY KEY,
    canonical_question_id TEXT NOT NULL,
    concise_answer TEXT NOT NULL,
    expanded_explanation TEXT NOT NULL,
    assumptions_json TEXT DEFAULT '[]',
    calculation_representation_json TEXT,
    common_mistakes_json TEXT DEFAULT '[]',
    follow_ups_json TEXT DEFAULT '[]',
    provenance_type TEXT NOT NULL,
    source_ids_json TEXT DEFAULT '[]',
    generator_version TEXT,
    validator_version TEXT,
    validation_status TEXT,
    confidence REAL DEFAULT 0.5,
    difficulty TEXT,
    references_json TEXT DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS ix_answers_canonical_question_id
    ON answers (canonical_question_id);

CREATE TABLE IF NOT EXISTS question_relationships (
    id TEXT PRIMARY KEY,
    from_question_id TEXT NOT NULL,
    to_question_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    reversible INTEGER DEFAULT 1,
    audit_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS merge_audit (
    id TEXT PRIMARY KEY,
    survivor_id TEXT NOT NULL,
    merged_id TEXT NOT NULL,
    reason TEXT,
    reversible INTEGER DEFAULT 1,
    payload_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS jobs (
    idempotency_key TEXT PRIMARY KEY,
    job_name TEXT NOT NULL,
    state TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    retry_count INTEGER DEFAULT 0,
    error_classification TEXT,
    input_count INTEGER DEFAULT 0,
    output_count INTEGER DEFAULT 0,
    parser_or_model_version TEXT,
    resume_checkpoint_json TEXT DEFAULT '{}',
    metrics_json TEXT DEFAULT '{}',
    message TEXT
);

CREATE TABLE IF NOT EXISTS dead_letters (
    id TEXT PRIMARY KEY,
    job_name TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    error_classification TEXT NOT NULL,
    error_message TEXT NOT NULL,
    payload_json TEXT DEFAULT '{}',
    created_at TEXT,
    retryable INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS source_registry (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    family TEXT NOT NULL,
    config_json TEXT DEFAULT '{}',
    enabled INTEGER DEFAULT 1
);
