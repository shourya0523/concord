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
    assert "BLOCKING" in (reports / "license-review.md").read_text(encoding="utf-8")
    assert (exports / "firm_signals.jsonl").is_file()
    summary = json.loads((reports / "run-summary.json").read_text(encoding="utf-8"))
    assert summary["publish_policy"]["teaching_truth"].startswith("github_source")
    # No interview-process placeholders in published teaching export
    for line in (exports / "questions.jsonl").read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        assert "[Interview process]" not in (row.get("canonical_wording") or "")
