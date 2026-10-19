-- 040_rag_licensed_guide_provenance.sql
-- Allow licensed_guide provenance on RAG documents (ADR 0007).

ALTER TABLE canonical.rag_documents
    DROP CONSTRAINT IF EXISTS rag_documents_provenance_check;

ALTER TABLE canonical.rag_documents
    ADD CONSTRAINT rag_documents_provenance_check
    CHECK (provenance IN (
        'licensed_guide',
        'github_source',
        'static_seed',
        'gemini_synthesised',
        'editorial',
        'glassdoor_occurrence'
    ));
