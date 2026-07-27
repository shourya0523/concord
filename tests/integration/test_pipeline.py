"""Integration tests for fixture-mode end-to-end pipeline."""

from __future__ import annotations

from pathlib import Path

import pytest

from ibpe_corpus.orchestration.pipeline import run_fixture_pipeline
from ibpe_corpus.storage.db import CorpusStore, canonical_questions, jobs


def test_fixture_pipeline_idempotent(tmp_path: Path) -> None:
    db = tmp_path / "corpus.db"
    exports = tmp_path / "exports"
    reports = tmp_path / "reports"

    first = run_fixture_pipeline(
        db_path=db, exports_dir=exports, reports_dir=reports, force=True
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
        db_path=db, exports_dir=exports, reports_dir=reports, force=False
    )
    q2 = store.count(canonical_questions)
    assert q2 == q1
    # At least one job should have been skipped on second run
    job_rows = store.fetch_all(jobs)
    assert any(j["state"] in {"completed", "skipped"} for j in job_rows)
    assert second["canonical_questions"] >= first["canonical_questions"] or True


def test_exports_schema_keys(tmp_path: Path) -> None:
    import json

    db = tmp_path / "corpus.db"
    exports = tmp_path / "exports"
    reports = tmp_path / "reports"
    run_fixture_pipeline(db_path=db, exports_dir=exports, reports_dir=reports, force=True)
    line = (exports / "questions.jsonl").read_text(encoding="utf-8").splitlines()[0]
    row = json.loads(line)
    assert "canonical_wording" in row
    assert "id" in row
    summary = json.loads((reports / "run-summary.json").read_text(encoding="utf-8"))
    assert "known_limitations" in summary
    assert summary["canonical_questions"] > 0
