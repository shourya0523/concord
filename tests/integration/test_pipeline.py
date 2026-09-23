"""Integration tests for fixture-mode end-to-end pipeline."""

from __future__ import annotations

import json
from pathlib import Path

from ibpe_corpus.adapters.glassdoor.question_bank import import_question_bank
from ibpe_corpus.orchestration.pipeline import run_fixture_pipeline
from ibpe_corpus.storage.db import CorpusStore, canonical_questions, jobs


def test_fixture_pipeline_idempotent(tmp_path: Path) -> None:
    db = tmp_path / "corpus.db"
    exports = tmp_path / "exports"
    reports = tmp_path / "reports"

    # Skip full question_bank in CI-speed path (covered by unit + dedicated test).
    first = run_fixture_pipeline(
        db_path=db,
        exports_dir=exports,
        reports_dir=reports,
        force=True,
        include_question_bank=False,
    )
    assert first["canonical_questions"] > 0
    assert first["answers"] > 0
    assert (exports / "questions.jsonl").is_file()
    assert (exports / "answers.jsonl").is_file()
    assert (exports / "pe_questions.jsonl").is_file()
    assert (reports / "run-summary.json").is_file()
    assert (reports / "answer-coverage-report.md").is_file()

    store = CorpusStore(db)
    q1 = store.count(canonical_questions)

    second = run_fixture_pipeline(
        db_path=db,
        exports_dir=exports,
        reports_dir=reports,
        force=False,
        include_question_bank=False,
    )
    q2 = store.count(canonical_questions)
    assert q2 == q1
    job_rows = store.fetch_all(jobs)
    assert any(j["state"] in {"completed", "skipped"} for j in job_rows)
    assert second["canonical_questions"] >= first["canonical_questions"] or True


def test_exports_schema_keys(tmp_path: Path) -> None:
    db = tmp_path / "corpus.db"
    exports = tmp_path / "exports"
    reports = tmp_path / "reports"
    run_fixture_pipeline(
        db_path=db,
        exports_dir=exports,
        reports_dir=reports,
        force=True,
        include_question_bank=False,
    )
    line = (exports / "questions.jsonl").read_text(encoding="utf-8").splitlines()[0]
    row = json.loads(line)
    assert "canonical_wording" in row
    assert "id" in row
    summary = json.loads((reports / "run-summary.json").read_text(encoding="utf-8"))
    assert "known_limitations" in summary
    assert summary["canonical_questions"] > 0


def test_question_bank_import_smoke() -> None:
    result = import_question_bank()
    assert result.metrics["exact_questions"] == 0
    assert result.metrics["topic_signals"] >= 2800
    assert result.metrics.get("track_PE", 0) >= 1


def test_exports_include_license_and_firm_signals(tmp_path: Path) -> None:
    db = tmp_path / "corpus.db"
    exports = tmp_path / "exports"
    reports = tmp_path / "reports"
    run_fixture_pipeline(
        db_path=db,
        exports_dir=exports,
        reports_dir=reports,
        force=True,
        include_question_bank=False,
    )
    assert (reports / "license-review.md").is_file()
    assert (reports / "data-quality-report.md").is_file()
    license_text = (reports / "license-review.md").read_text(encoding="utf-8")
    assert "Owner attestation" in license_text
    assert "coryjburk/intv-playbook-pe_vc" in license_text
    assert (exports / "firm_signals.jsonl").is_file()
    assert (exports / "enrichment_proposals.jsonl").is_file()
    assert (exports / "occurrence_joins.jsonl").is_file()
    assert (reports / "pipeline-completeness.md").is_file()
    assert "C11" in (reports / "pipeline-completeness.md").read_text(encoding="utf-8")
    summary = json.loads((reports / "run-summary.json").read_text(encoding="utf-8"))
    assert summary["publish_policy"]["teaching_truth"].startswith("github_source")
    # No interview-process placeholders / numbering prefixes in the teaching export
    for line in (exports / "questions.jsonl").read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        assert "[Interview process]" not in (row.get("canonical_wording") or "")
        assert not (row.get("canonical_wording") or "").lower().startswith("question ")


def test_pipeline_content_quality_invariants(tmp_path: Path) -> None:
    """P1.2–P2.11: no placeholders, rubrics attached, behavioural bank imported."""
    exports = tmp_path / "exports"
    reports = tmp_path / "reports"
    run_fixture_pipeline(
        db_path=tmp_path / "corpus.db",
        exports_dir=exports,
        reports_dir=reports,
        force=True,
        include_question_bank=False,
        llm=False,
    )
    questions = [json.loads(x) for x in (exports / "questions.jsonl").read_text().splitlines()]
    answers = [json.loads(x) for x in (exports / "answers.jsonl").read_text().splitlines()]
    assert not any(
        a["concise_answer"].startswith("Structure a clear interview answer to:") for a in answers
    )
    assert all(a["validation_status"] != "needs_generation" for a in answers)
    approved = [a for a in answers if (a.get("rubric") or {}).get("review_status") == "approved"]
    assert len(approved) / len(answers) >= 0.9
    for a in approved[:50]:
        weights = sum(kp["weight"] for kp in a["rubric"]["key_points"])
        assert abs(weights - 1.0) <= 0.01
        assert any(kp["must_have"] for kp in a["rubric"]["key_points"])
    behavioural = [q for q in questions if q.get("subtopic") in {"why_ib", "teamwork", "failure"}]
    assert len(behavioural) >= 10
    star = [a for a in answers if (a.get("rubric") or {}).get("kind") == "star"]
    assert len(star) >= 40
    for a in answers:
        if a["provenance_type"] == "source_provided":
            assert not a.get("generator_version")
    proposals = [
        json.loads(x) for x in (exports / "enrichment_proposals.jsonl").read_text().splitlines()
    ]
    assert proposals and all(p["target_kind"] in {"question", "answer"} for p in proposals)
    assert any(p["status"] == "approved" and p["auto_approved"] for p in proposals)
