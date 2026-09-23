"""Write final exports and reports (teaching publish gate + license notes)."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

from ibpe_corpus.canonical.taxonomy_rules import infer_topic
from ibpe_corpus.metrics.completeness import write_reports
from ibpe_corpus.canonical.publish_gate import (
    filter_publishable_answers,
    filter_publishable_questions,
    is_interview_process_placeholder,
)
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
    proposals: Sequence[Any] | None = None,
    signal_join_rows: Sequence[dict[str, Any]] | None = None,
    enrichment: dict[str, Any] | None = None,
) -> dict[str, Any]:
    exports_dir = Path(exports_dir)
    reports_dir = Path(reports_dir)
    exports_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)

    publishable, withheld = filter_publishable_questions(questions)
    publishable_ids = {q.id for q in publishable}
    pub_answers, withheld_answers = filter_publishable_answers(answers, publishable_ids)

    pub_variants = [v for v in variants if v.canonical_question_id in publishable_ids]
    pub_variant_ids = {v.id for v in pub_variants}
    pub_occurrences = [o for o in occurrences if o.question_variant_id in pub_variant_ids]
    signal_questions = [q for q in withheld if q.review_state == "topic_signal"]

    q_rows = [_dump_model(q) for q in publishable]
    v_rows = [_dump_model(v) for v in pub_variants]
    o_rows = [_dump_model(o) for o in pub_occurrences]
    r_rows = [
        _dump_model(r)
        for r in responses
        if not is_interview_process_placeholder(r.exact_source_text)
    ]
    a_rows = [_dump_model(a) for a in pub_answers]
    pe_rows = [
        q
        for q in q_rows
        if q.get("domain") in {Domain.PE.value, Domain.BOTH.value}
        or q.get("pe_relevance")
        in {"core_pe_investing", "adjacent_pe_investing", "portfolio_operations"}
    ]
    signal_rows = [_dump_model(q) for q in signal_questions]
    # Firm-signal clusters carry a heuristic topic (keyword rules v4) for heat.
    for row in signal_rows:
        if not row.get("topic"):
            tagged = infer_topic(row.get("canonical_wording") or "")
            row["topic"] = tagged if tagged != "untagged" else None

    _write_jsonl(exports_dir / "questions.jsonl", q_rows)
    _write_jsonl(exports_dir / "question_variants.jsonl", v_rows)
    _write_jsonl(exports_dir / "interview_occurrences.jsonl", o_rows)
    _write_jsonl(exports_dir / "question_responses.jsonl", r_rows)
    _write_jsonl(exports_dir / "answers.jsonl", a_rows)
    _write_jsonl(exports_dir / "pe_questions.jsonl", pe_rows)
    _write_jsonl(exports_dir / "firm_signals.jsonl", signal_rows)
    _write_jsonl(exports_dir / "rejected_records.jsonl", list(rejected))
    # Durable enrichment proposals (P2.1) and signal → teaching joins (P2.7).
    _write_jsonl(
        exports_dir / "enrichment_proposals.jsonl",
        [_dump_model(p) for p in (proposals or [])],
    )
    _write_jsonl(exports_dir / "occurrence_joins.jsonl", list(signal_join_rows or []))

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
        1 for a in pub_answers if a.provenance_type == AnswerProvenance.SOURCE_PROVIDED
    )
    matched = sum(
        1 for a in pub_answers if a.provenance_type == AnswerProvenance.CORPUS_MATCHED
    )
    generated = sum(
        1
        for a in pub_answers
        if a.provenance_type
        in {
            AnswerProvenance.SYNTHESISED_UNVALIDATED,
            AnswerProvenance.SYNTHESISED_VALIDATED,
            AnswerProvenance.NEEDS_REVIEW,
        }
    )
    validated = sum(
        1
        for a in pub_answers
        if a.validation_status
        in {ValidationStatus.PASS, ValidationStatus.PASS_WITH_ASSUMPTIONS}
        or a.provenance_type == AnswerProvenance.SYNTHESISED_VALIDATED
    )
    rejected_n = sum(
        1 for a in pub_answers if a.provenance_type == AnswerProvenance.REJECTED
    )
    dup_rate = metrics.get("duplicate_rate", 0)
    val_rate = (validated / len(pub_answers)) if pub_answers else 0.0
    placeholder_rejected = sum(
        1
        for row in rejected
        if "placeholder" in str(row.get("reason") or "").lower()
        or "interview_process" in str(row.get("reason") or "").lower()
    )

    run_summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_raw_artefacts": metrics.get("pages_fetched", 0),
        "total_occupation_searches": metrics.get("pages_discovered", 0),
        "total_employer_pages": 0,
        "total_interview_reviews": len(pub_occurrences),
        "total_question_details": metrics.get("question_details_reached", 0),
        "total_responses_comments": len(r_rows),
        "exact_questions": metrics.get("exact_questions", len(publishable)),
        "pe_questions": len(pe_rows),
        "canonical_questions": len(questions),
        "publishable_teaching_questions": len(publishable),
        "firm_signal_topic_clusters": len(signal_questions),
        "source_provided_answers": source_answers,
        "matched_answers": matched,
        "generated_answers": generated,
        "validated_answers": validated,
        "rejected_answers": rejected_n + len(withheld_answers),
        "placeholders_rejected": placeholder_rejected,
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
            "Answer synthesis uses deterministic topic templates; Gemini (enrich-v1 / "
            "rubric-v1) runs only when a key is configured.",
            "Heuristic rubrics and taxonomy auto-approvals are rule-validated, not human-reviewed.",
            "GitHub teaching corpora are cleared by owner attestation (2026-09-23); "
            "see reports/license-review.md.",
            "question_bank.json is firm_signal only — never teaching answers.",
        ],
        "publish_policy": {
            "teaching_truth": "github_source + static_seed",
            "firm_signals": "glassdoor_occurrence / question_bank",
            "reject": [
                "[Interview process] placeholders",
                "generic synthesis placeholders (needs_generation)",
                "rejected answers",
            ],
            "license_gate": "reports/license-review.md (owner attestation recorded)",
        },
        "enrichment": enrichment or {},
        "export_files": 11,
        "test_results": "see CI / pytest",
    }
    (reports_dir / "run-summary.json").write_text(
        json.dumps(run_summary, indent=2, default=str) + "\n", encoding="utf-8"
    )

    # Answer coverage, completeness scoreboard and license review are computed
    # from the exports just written so reports always match what ships.
    write_reports(exports_dir, reports_dir, enrichment=enrichment)
    _write_data_quality_report(
        reports_dir / "data-quality-report.md",
        questions=questions,
        publishable=publishable,
        signal_questions=signal_questions,
        answers=pub_answers,
        responses=r_rows,
        occurrences=pub_occurrences,
        metrics=metrics,
        alerts=alerts or [],
        placeholder_rejected=placeholder_rejected,
        withheld_answers=len(withheld_answers),
    )
    _write_duplicate_report(
        reports_dir / "duplicate-report.md",
        questions=questions,
        variants=variants,
        publishable=publishable,
        dup_rate=dup_rate,
    )

    frontend = reports_dir / "glassdoor-frontend-report.md"
    if not frontend.exists():
        frontend.write_text(
            "# Glassdoor frontend report\n\nSee docs/research/glassdoor-frontend-analysis.md\n",
            encoding="utf-8",
        )

    return run_summary


def _write_data_quality_report(
    path: Path,
    *,
    questions: Sequence[CanonicalQuestion],
    publishable: Sequence[CanonicalQuestion],
    signal_questions: Sequence[CanonicalQuestion],
    answers: Sequence[Answer],
    responses: Sequence[Any],
    occurrences: Sequence[InterviewOccurrence],
    metrics: dict[str, Any],
    alerts: list[str],
    placeholder_rejected: int,
    withheld_answers: int,
) -> None:
    with_evidence = sum(1 for a in answers if a.source_ids)
    path.write_text(
        "\n".join(
            [
                "# Data quality report",
                "",
                "## Teaching vs firm signals",
                "",
                f"- Canonical rows (all): {len(questions)}",
                f"- Publishable teaching questions: {len(publishable)}",
                f"- Firm-signal topic clusters (withheld from teaching publish): {len(signal_questions)}",
                f"- Firm-signal occurrences joined to teaching Qs: {len(occurrences)}",
                f"- Answers with provenance source_ids: {with_evidence}/{len(answers)}",
                f"- Glassdoor responses extracted: {len(responses)}",
                f"- Exact questions metric: {metrics.get('exact_questions')}",
                f"- Pages blocked: {metrics.get('pages_blocked')}",
                f"- Zero-result anomalies: {metrics.get('zero_result_anomalies')}",
                f"- `[Interview process]` placeholders rejected: {placeholder_rejected}",
                f"- Answers withheld by publish gate: {withheld_answers}",
                "",
                "## Policy",
                "",
                "- GitHub / static seed = teaching source of truth (`product_role=teaching_qa`).",
                "- `question_bank.json` = firm signals only (`product_role=firm_signal`).",
                "- Never publish `[Interview process]` placeholders as questions or answers.",
                "- Dedup: teaching corpus uses normalised SHA-256 + fuzzy `token_set_ratio`",
                "  (concept-gated); firm-signal clusters use exact-hash at bank scale.",
                "  All merges write reversible `merge_audit` payloads.",
                "- Production publish blocked until `reports/license-review.md` clears high-priority sources.",
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
    publishable: Sequence[CanonicalQuestion],
    dup_rate: Any,
) -> None:
    path.write_text(
        "\n".join(
            [
                "# Duplicate report",
                "",
                f"- Canonical questions (all): {len(questions)}",
                f"- Publishable teaching questions: {len(publishable)}",
                f"- Variants: {len(variants)}",
                f"- Duplicate rate (1 - canonical/variants): {dup_rate}",
                "",
                "Merges are reversible via `merge_audit` rows (`reverse_merge` / payload snapshots).",
                "Beyond SHA1: normalised SHA-256 exact-hash + rapidfuzz token_set_ratio with",
                "`same_answer_would_satisfy` distinctive-concept guard on the teaching corpus.",
                "Firm-signal topic clusters dedupe by exact hash only at bank scale; joins onto",
                "teaching Qs use exact-hash + fuzzy (threshold 88) and are reversible.",
                "",
            ]
        ),
        encoding="utf-8",
    )
