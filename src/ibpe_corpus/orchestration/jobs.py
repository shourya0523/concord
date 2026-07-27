"""Restartable job runner with idempotency keys and dead letters."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from ibpe_corpus.schemas.models import DeadLetter, JobResult, JobState, new_id
from ibpe_corpus.storage.db import CorpusStore, dead_letters, jobs

JOB_NAMES = (
    "discover_sources",
    "discover_glassdoor_roles",
    "resolve_employers",
    "fetch_question_lists",
    "fetch_company_interviews",
    "fetch_question_details",
    "fetch_question_responses",
    "archive_raw_artefacts",
    "extract_records",
    "classify_pe_relevance",
    "canonicalise_questions",
    "match_existing_answers",
    "generate_missing_answers",
    "validate_answers",
    "score_quality",
    "export_dataset",
)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobRunner:
    """Execute jobs with stable idempotency keys against CorpusStore."""

    def __init__(self, store: CorpusStore) -> None:
        self.store = store

    def run(
        self,
        job_name: str,
        idempotency_key: str,
        fn: Callable[[], dict[str, Any]],
        *,
        force: bool = False,
        parser_or_model_version: str | None = None,
    ) -> JobResult:
        existing = self.store.get_job(idempotency_key)
        if existing and existing.get("state") == JobState.COMPLETED.value and not force:
            return JobResult(
                job_name=job_name,
                idempotency_key=idempotency_key,
                state=JobState.SKIPPED,
                started_at=None,
                completed_at=datetime.now(timezone.utc),
                retry_count=int(existing.get("retry_count") or 0),
                input_count=int(existing.get("input_count") or 0),
                output_count=int(existing.get("output_count") or 0),
                parser_or_model_version=existing.get("parser_or_model_version"),
                resume_checkpoint=__import__("json").loads(
                    existing.get("resume_checkpoint_json") or "{}"
                ),
                metrics=__import__("json").loads(existing.get("metrics_json") or "{}"),
                message="idempotent skip: already completed",
            )

        started = _utcnow()
        retry = int((existing or {}).get("retry_count") or 0)
        if existing and existing.get("state") == JobState.FAILED.value:
            retry += 1

        self.store.upsert_dict(
            jobs,
            {
                "idempotency_key": idempotency_key,
                "job_name": job_name,
                "state": JobState.RUNNING.value,
                "started_at": started,
                "completed_at": None,
                "retry_count": retry,
                "error_classification": None,
                "input_count": 0,
                "output_count": 0,
                "parser_or_model_version": parser_or_model_version,
                "resume_checkpoint_json": "{}",
                "metrics_json": "{}",
                "message": None,
            },
        )

        try:
            payload = fn() or {}
            result = JobResult(
                job_name=job_name,
                idempotency_key=idempotency_key,
                state=JobState.COMPLETED,
                started_at=datetime.fromisoformat(started),
                completed_at=datetime.now(timezone.utc),
                retry_count=retry,
                input_count=int(payload.get("input_count") or 0),
                output_count=int(payload.get("output_count") or 0),
                parser_or_model_version=parser_or_model_version,
                resume_checkpoint=payload.get("resume_checkpoint") or {},
                metrics=payload.get("metrics") or {},
                message=payload.get("message"),
            )
            self._persist(result)
            return result
        except Exception as exc:  # noqa: BLE001 — boundary for job DLQ
            err_class = type(exc).__name__
            result = JobResult(
                job_name=job_name,
                idempotency_key=idempotency_key,
                state=JobState.FAILED,
                started_at=datetime.fromisoformat(started),
                completed_at=datetime.now(timezone.utc),
                retry_count=retry,
                error_classification=err_class,
                parser_or_model_version=parser_or_model_version,
                message=str(exc),
            )
            self._persist(result)
            dlq = DeadLetter(
                id=new_id("dlq"),
                job_name=job_name,
                idempotency_key=idempotency_key,
                error_classification=err_class,
                error_message=str(exc),
                payload={"exception_type": err_class},
                retryable=True,
            )
            self.store.insert_ignore(
                dead_letters,
                {
                    "id": dlq.id,
                    "job_name": dlq.job_name,
                    "idempotency_key": dlq.idempotency_key,
                    "error_classification": dlq.error_classification,
                    "error_message": dlq.error_message,
                    "payload_json": self.store.dumps(dlq.payload),
                    "created_at": dlq.created_at.isoformat(),
                    "retryable": 1,
                },
            )
            return result

    def _persist(self, result: JobResult) -> None:
        self.store.upsert_dict(
            jobs,
            {
                "idempotency_key": result.idempotency_key,
                "job_name": result.job_name,
                "state": result.state.value,
                "started_at": result.started_at.isoformat() if result.started_at else None,
                "completed_at": result.completed_at.isoformat()
                if result.completed_at
                else None,
                "retry_count": result.retry_count,
                "error_classification": result.error_classification,
                "input_count": result.input_count,
                "output_count": result.output_count,
                "parser_or_model_version": result.parser_or_model_version,
                "resume_checkpoint_json": self.store.dumps(result.resume_checkpoint),
                "metrics_json": self.store.dumps(result.metrics),
                "message": result.message,
            },
        )
