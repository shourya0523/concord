"""SQLite persistence for artefacts, jobs, and canonical entities."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

from sqlalchemy import (
    Column,
    Float,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    select,
)
from sqlalchemy.engine import Engine

METADATA = MetaData()

source_artefacts = Table(
    "source_artefacts",
    METADATA,
    Column("id", String, primary_key=True),
    Column("source_family", String, nullable=False),
    Column("url_or_path", String, nullable=False),
    Column("commit_sha", String),
    Column("retrieved_at", String),
    Column("raw_html_path", String),
    Column("raw_json_path", String),
    Column("screenshot_path", String),
    Column("network_log_path", String),
    Column("content_hash", String, nullable=False),
    Column("parser_version", String, nullable=False),
    Column("access_state", String, nullable=False),
    Column("session_class", String),
    Column("metadata_json", Text, default="{}"),
)

raw_records = Table(
    "raw_records",
    METADATA,
    Column("id", String, primary_key=True),
    Column("source_artefact_id", String, nullable=False),
    Column("exact_source_text", Text, nullable=False),
    Column("source_selector_or_span", String),
    Column("record_type", String, nullable=False),
    Column("extraction_method", String, nullable=False),
    Column("extracted_metadata_json", Text, default="{}"),
    Column("grounding_confidence", Float, default=1.0),
    Column("validation_status", String, default="not_run"),
)

canonical_questions = Table(
    "canonical_questions",
    METADATA,
    Column("id", String, primary_key=True),
    Column("canonical_wording", Text, nullable=False),
    Column("question_type", String),
    Column("topic", String),
    Column("subtopic", String),
    Column("domain", String),
    Column("pe_strategy", String),
    Column("pe_relevance", String),
    Column("seniority", String),
    Column("difficulty", String),
    Column("review_state", String),
    Column("normalised_hash", String, index=True),
)

question_variants = Table(
    "question_variants",
    METADATA,
    Column("id", String, primary_key=True),
    Column("canonical_question_id", String, nullable=False, index=True),
    Column("source_wording", Text, nullable=False),
    Column("cleaned_wording", Text, nullable=False),
    Column("normalised_hash", String, nullable=False, index=True),
    Column("language", String, default="en"),
    Column("variant_type", String),
    Column("source_artefact_id", String),
)

interview_occurrences = Table(
    "interview_occurrences",
    METADATA,
    Column("id", String, primary_key=True),
    Column("question_variant_id", String, nullable=False),
    Column("interview_review_id", String),
    Column("employer", String),
    Column("employer_id", String),
    Column("role", String),
    Column("office", String),
    Column("round", String),
    Column("interview_date", String),
    Column("recruiting_cycle", String),
    Column("outcome", String),
    Column("source_id", String, nullable=False),
    Column("confidence", Float, default=1.0),
    Column("detail_url", String),
)

question_responses = Table(
    "question_responses",
    METADATA,
    Column("id", String, primary_key=True),
    Column("question_id", String, nullable=False),
    Column("source_response_id", String),
    Column("response_type", String, nullable=False),
    Column("exact_source_text", Text, nullable=False),
    Column("source_provided", Integer, default=1),
    Column("posted_date", String),
    Column("helpful_metadata_json", Text, default="{}"),
    Column("classification_confidence", Float, default=0.5),
    Column("parent_response_id", String),
    Column("source_url", String),
    Column("access_state", String),
    Column("source_artefact_id", String),
)

answers = Table(
    "answers",
    METADATA,
    Column("id", String, primary_key=True),
    Column("canonical_question_id", String, nullable=False, index=True),
    Column("concise_answer", Text, nullable=False),
    Column("expanded_explanation", Text, nullable=False),
    Column("assumptions_json", Text, default="[]"),
    Column("calculation_representation_json", Text),
    Column("common_mistakes_json", Text, default="[]"),
    Column("follow_ups_json", Text, default="[]"),
    Column("provenance_type", String, nullable=False),
    Column("source_ids_json", Text, default="[]"),
    Column("generator_version", String),
    Column("validator_version", String),
    Column("validation_status", String),
    Column("confidence", Float, default=0.5),
    Column("difficulty", String),
    Column("references_json", Text, default="[]"),
)

question_relationships = Table(
    "question_relationships",
    METADATA,
    Column("id", String, primary_key=True),
    Column("from_question_id", String, nullable=False),
    Column("to_question_id", String, nullable=False),
    Column("relationship_type", String, nullable=False),
    Column("confidence", Float, default=1.0),
    Column("reversible", Integer, default=1),
    Column("audit_json", Text, default="{}"),
)

merge_audit = Table(
    "merge_audit",
    METADATA,
    Column("id", String, primary_key=True),
    Column("survivor_id", String, nullable=False),
    Column("merged_id", String, nullable=False),
    Column("reason", String),
    Column("reversible", Integer, default=1),
    Column("payload_json", Text, default="{}"),
)

jobs = Table(
    "jobs",
    METADATA,
    Column("idempotency_key", String, primary_key=True),
    Column("job_name", String, nullable=False),
    Column("state", String, nullable=False),
    Column("started_at", String),
    Column("completed_at", String),
    Column("retry_count", Integer, default=0),
    Column("error_classification", String),
    Column("input_count", Integer, default=0),
    Column("output_count", Integer, default=0),
    Column("parser_or_model_version", String),
    Column("resume_checkpoint_json", Text, default="{}"),
    Column("metrics_json", Text, default="{}"),
    Column("message", Text),
)

dead_letters = Table(
    "dead_letters",
    METADATA,
    Column("id", String, primary_key=True),
    Column("job_name", String, nullable=False),
    Column("idempotency_key", String, nullable=False),
    Column("error_classification", String, nullable=False),
    Column("error_message", Text, nullable=False),
    Column("payload_json", Text, default="{}"),
    Column("created_at", String),
    Column("retryable", Integer, default=0),
)

source_registry = Table(
    "source_registry",
    METADATA,
    Column("id", String, primary_key=True),
    Column("name", String, nullable=False, unique=True),
    Column("family", String, nullable=False),
    Column("config_json", Text, default="{}"),
    Column("enabled", Integer, default=1),
)


class CorpusStore:
    def __init__(self, db_path: str | Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.engine: Engine = create_engine(f"sqlite:///{self.db_path}")
        METADATA.create_all(self.engine)

    def upsert_dict(self, table: Table, row: dict[str, Any]) -> None:
        with self.engine.begin() as conn:
            existing = conn.execute(
                select(table.c).where(table.c[list(table.primary_key)[0].name] == row[list(table.primary_key)[0].name])
            ).first()
            if existing:
                pk = list(table.primary_key)[0].name
                values = {k: v for k, v in row.items() if k != pk}
                conn.execute(table.update().where(table.c[pk] == row[pk]).values(**values))
            else:
                conn.execute(table.insert().values(**row))

    def insert_ignore(self, table: Table, row: dict[str, Any]) -> bool:
        pk = list(table.primary_key)[0].name
        with self.engine.begin() as conn:
            existing = conn.execute(select(table.c[pk]).where(table.c[pk] == row[pk])).first()
            if existing:
                return False
            conn.execute(table.insert().values(**row))
            return True

    def fetch_all(self, table: Table) -> list[dict[str, Any]]:
        with self.engine.connect() as conn:
            rows = conn.execute(select(table)).mappings().all()
            return [dict(r) for r in rows]

    def count(self, table: Table) -> int:
        with self.engine.connect() as conn:
            return int(conn.execute(select(table)).rowcount or len(conn.execute(select(table)).all()))

    def get_job(self, idempotency_key: str) -> dict[str, Any] | None:
        with self.engine.connect() as conn:
            row = conn.execute(
                select(jobs).where(jobs.c.idempotency_key == idempotency_key)
            ).mappings().first()
            return dict(row) if row else None

    def dumps(self, value: Any) -> str:
        return json.dumps(value, default=str)


def json_loads(value: str | None, default: Any = None) -> Any:
    if not value:
        return default
    return json.loads(value)
