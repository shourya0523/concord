-- 033_rag_embeddings.sql
-- Real RAG: pgvector embeddings for published teaching Q/A (+ answer text).
-- Owner: ibpe-database / orchestrator product gaps (no UI).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS canonical.rag_documents (
    id                  text PRIMARY KEY,
    kind                text NOT NULL DEFAULT 'canonical_question'
                        CHECK (kind IN (
                            'canonical_question', 'concept', 'resource', 'answer_chunk'
                        )),
    canonical_question_id text REFERENCES canonical.canonical_questions (id) ON DELETE CASCADE,
    title               text NOT NULL,
    body                text NOT NULL,
    topic               text,
    domain              text,
    difficulty          text,
    provenance          text NOT NULL
                        CHECK (provenance IN (
                            'github_source', 'static_seed', 'gemini_synthesised',
                            'editorial', 'glassdoor_occurrence'
                        )),
    content_hash        text NOT NULL,
    embedding           vector(768),
    model_id            text NOT NULL DEFAULT 'google/gemini-embedding-001',
    metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_rag_documents_question
    ON canonical.rag_documents (canonical_question_id);
CREATE INDEX IF NOT EXISTS ix_rag_documents_topic
    ON canonical.rag_documents (topic);
CREATE INDEX IF NOT EXISTS ix_rag_documents_content_hash
    ON canonical.rag_documents (content_hash);

-- Cosine distance index (build after first embed batch; ALLOW empty)
CREATE INDEX IF NOT EXISTS ix_rag_documents_embedding_hnsw
    ON canonical.rag_documents
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE canonical.rag_documents IS
  'Real RAG chunks: Gemini embeddings (768-d) over teaching corpus; Glassdoor never stored as answers.';
