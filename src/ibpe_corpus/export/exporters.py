"""Write final exports and reports."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    CanonicalQuestion,
    Domain,
    InterviewOccurrence,
    QuestionResponse,
    QuestionVariant,
    ValidationStatus,
)


def _write_jsonl(path: Path, rows: Sequence[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, default=str) + "\n")


def _dump_model(obj: Any) -> dict[str, Any]:
    if hasattr(obj, "model_dump"):
        return obj.model_dump(mode="json")
    if isinstance(obj, dict):
        return obj
    return dict(obj)


def export_all(
    *,
    exports_dir: Path,
    reports_dir: Path,
    questions: Sequence[CanonicalQuestion],
    variants: Sequence[QuestionVariant],
    occurrences: Sequence[InterviewOccurrence],
    responses: Sequence[QuestionResponse],
    answers: Sequence[Answer],
    rejected: Sequence[dict[str, Any]],
    metrics: dict[str, Any],
    job_results: list[dict[str, Any]],
    relationships: Sequence[Any] | None = None,
    coverage: Any | None = None,
    alerts: list[str] | None = None,
) -> dict[str, Any]:
    exports_dir = Path(exports_dir)
    reports_dir = Path(reports_dir)
    exports_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)

    q_rows = [_dump_model(q) for q in questions]
    v_rows = [_dump_model(v) for v in variants]
    o_rows = [_dump_model(o) for o in occurrences]
    r_rows = [_dump_model(r) for r in responses]
    a_rows = [_dump_model(a) for a in answers]
    pe_rows = [
        q
        for q in q_rows
        if q.get("domain") in {Domain.PE.value, Domain.BOTH.value}
        or q.get("pe_relevance")
        in {"core_pe_investing", "adjacent_pe_investing", "portfolio_operations"}
    ]

    _write_jsonl(exports_dir / "questions.jsonl", q_rows)
    _write_jsonl(exports_dir / "question_variants.jsonl", v_rows)
    _write_jsonl(exports_dir / "interview_occurrences.jsonl", o_rows)
    _write_jsonl(exports_dir / "question_responses.jsonl", r_rows)
    _write_jsonl(exports_dir / "answers.jsonl", a_rows)
    _write_jsonl(exports_dir / "pe_questions.jsonl", pe_rows)
    _write_jsonl(exports_dir / "rejected_records.jsonl", list(rejected))

    csv_path = exports_dir / "questions.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "id",
                "canonical_wording",
                "question_type",
                "topic",
                "domain",
                "pe_strategy",
                "pe_relevance",
                "seniority",
                "difficulty",
                "review_state",
                "normalised_hash",
            ],
        )
        writer.writeheader()
        for q in q_rows:
            writer.writerow({k: q.get(k) for k in writer.fieldnames})

    source_answers = sum(
        1 for a in answers if a.provenance_type == AnswerProvenance.SOURCE_PROVIDED
    )
    matched = sum(
        1 for a in answers if a.provenance_type == AnswerProvenance.CORPUS_MATCHED
    )
    generated = sum(
        1
        for a in answers
        if a.provenance_type
        in {
            AnswerProvenance.SYNTHESISED_UNVALIDATED,
            AnswerProvenance.SYNTHESISED_VALIDATED,
            AnswerProvenance.NEEDS_REVIEW,
        }
    )
    validated = sum(
        1
        for a in answers
        if a.validation_status
        in {ValidationStatus.PASS, ValidationStatus.PASS_WITH_ASSUMPTIONS}
        or a.provenance_type == AnswerProvenance.SYNTHESISED_VALIDATED
    )
    rejected_n = sum(
        1 for a in answers if a.provenance_type == AnswerProvenance.REJECTED
    )
    dup_rate = metrics.get("duplicate_rate", 0)
    val_rate = (validated / len(answers)) if answers else 0.0

    run_summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_raw_artefacts": metrics.get("pages_fetched", 0),
        "total_occupation_searches": metrics.get("pages_discovered", 0),
        "total_employer_pages": 0,
        "total_interview_reviews": len(occurrences),
        "total_question_details": metrics.get("question_details_reached", 0),
        "total_responses_comments": len(responses),
        "exact_questions": metrics.get("exact_questions", len(questions)),
        "pe_questions": len(pe_rows),
        "canonical_questions": len(questions),
        "source_provided_answers": source_answers,
        "matched_answers": matched,
        "generated_answers": generated,
        "validated_answers": validated,
        "rejected_answers": rejected_n,
        "duplicate_rate": dup_rate,
        "validation_rate": round(val_rate, 4),
        "metrics": metrics,
        "alerts": alerts or [],
        "jobs": job_results,
        "relationship_count": len(list(relationships or [])),
        "known_limitations": [
            "Live Glassdoor fetches return Cloudflare/CAPTCHA 403 in this environment.",
            "Glassdoor application DOM/network shapes are validated via synthetic fixtures only.",
            "PE employer crawl counts remain matrix-planned until live access is available.",
            "Answer synthesis uses deterministic templates, not an external LLM.",
        ],
        "export_files": 8,
        "test_results": "see CI / pytest",
    }
    (reports_dir / "run-summary.json").write_text(
        json.dumps(run_summary, indent=2, default=str) + "\n", encoding="utf-8"
    )

    _write_answer_coverage_report(
        reports_dir / "answer-coverage-report.md",
        answers=answers,
        questions=questions,
        source_answers=source_answers,
        matched=matched,
        generated=generated,
        validated=validated,
        rejected_n=rejected_n,
    )
    _write_data_quality_report(
        reports_dir / "data-quality-report.md",
        questions=questions,
        answers=answers,
        responses=responses,
        metrics=metrics,
        alerts=alerts or [],
    )
    _write_duplicate_report(
        reports_dir / "duplicate-report.md",
        questions=questions,
        variants=variants,
        dup_rate=dup_rate,
    )

    # Preserve existing frontend research report; refresh pointer note
    frontend = reports_dir / "glassdoor-frontend-report.md"
    if not frontend.exists():
        frontend.write_text(
            "# Glassdoor frontend report\n\nSee docs/research/glassdoor-frontend-analysis.md\n",
            encoding="utf-8",
        )

    return run_summary


def _write_answer_coverage_report(
    path: Path,
    *,
    answers: Sequence[Answer],
    questions: Sequence[CanonicalQuestion],
    source_answers: int,
    matched: int,
    generated: int,
    validated: int,
    rejected_n: int,
) -> None:
    answered = {a.canonical_question_id for a in answers if a.provenance_type != AnswerProvenance.REJECTED}
    coverage = (len(answered) / len(questions)) if questions else 0.0
    path.write_text(
        "\n".join(
            [
                "# Answer coverage report",
                "",
                f"- Canonical questions: {len(questions)}",
                f"- Answers (non-rejected): {len(answered)}",
                f"- Coverage: {coverage:.1%}",
                f"- Source-provided: {source_answers}",
                f"- Corpus-matched: {matched}",
                f"- Generated: {generated}",
                f"- Validated: {validated}",
                f"- Rejected: {rejected_n}",
                "",
                "## Provenance rule",
                "",
                "Synthesised answers are never labelled `source_provided`.",
                "",
            ]
        ),
        encoding="utf-8",
    )


def _write_data_quality_report(
    path: Path,
    *,
    questions: Sequence[CanonicalQuestion],
    answers: Sequence[Answer],
    responses: Sequence[QuestionResponse],
    metrics: dict[str, Any],
    alerts: list[str],
) -> None:
    with_evidence = sum(1 for a in answers if a.source_ids)
    path.write_text(
        "\n".join(
            [
                "# Data quality report",
                "",
                f"- Canonical questions: {len(questions)}",
                f"- Answers with provenance source_ids: {with_evidence}/{len(answers)}",
                f"- Glassdoor responses extracted: {len(responses)}",
                f"- Exact questions metric: {metrics.get('exact_questions')}",
                f"- Pages blocked: {metrics.get('pages_blocked')}",
                f"- Zero-result anomalies: {metrics.get('zero_result_anomalies')}",
                "",
                "## Alerts",
                "",
                *([f"- {a}" for a in alerts] if alerts else ["- None"]),
                "",
            ]
        ),
        encoding="utf-8",
    )


def _write_duplicate_report(
    path: Path,
    *,
    questions: Sequence[CanonicalQuestion],
    variants: Sequence[QuestionVariant],
    dup_rate: Any,
) -> None:
    path.write_text(
        "\n".join(
            [
                "# Duplicate report",
                "",
                f"- Canonical questions: {len(questions)}",
                f"- Variants: {len(variants)}",
                f"- Duplicate rate (1 - canonical/variants): {dup_rate}",
                "",
                "Merges are reversible via `merge_audit` rows.",
                "",
            ]
        ),
        encoding="utf-8",
    )
