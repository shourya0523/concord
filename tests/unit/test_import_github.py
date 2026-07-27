"""Unit tests for GitHub corpus fetch + importers (offline-first)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from ibpe_corpus.adapters.github.adapter import GitHubSourceAdapter
from ibpe_corpus.adapters.github.fetch_repo import (
    content_hash_file,
    fetch_github_path,
    load_github_sources,
)
from ibpe_corpus.adapters.github.importers import (
    import_firebase_qb_export,
    import_html_playbook,
    import_markdown_questions,
)
from ibpe_corpus.schemas.models import ExtractionClass

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "fixtures" / "corpus"
STAGED_CM = (
    ROOT
    / "data"
    / "staging"
    / "github"
    / "ddeng5_Capital-Markets-Question-Bank-App"
    / "www"
    / "investment-banking-qb-export.json"
)
CM_REPO = "ddeng5/Capital-Markets-Question-Bank-App"
CM_SHA = "05dca57601532f95f7be72b83b76ce80a5c7dcca"
CM_PATH = "www/investment-banking-qb-export.json"
CM_URL = (
    f"https://raw.githubusercontent.com/{CM_REPO}/{CM_SHA}/{CM_PATH}"
)


def _mini_firebase(tmp_path: Path) -> Path:
    payload = {
        "accounting": {
            "1": {
                "question": "Question 1: Walk me through the income statement.",
                "answer": "Revenue minus expenses equals net income.",
            },
            "2": {
                "question": "Question 2: What is EBITDA?",
                "answer": "Earnings before interest, taxes, depreciation, and amortization.",
            },
        },
        "lbo": {
            "1": {
                "question": "Walk me through an LBO.",
                "answer": "Buy with debt and equity, pay down debt, exit.",
            }
        },
    }
    path = tmp_path / "mini-qb-export.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_load_github_sources_config():
    sources = load_github_sources(ROOT / "config" / "github_sources.yml")
    assert sources
    repos = {s["repo"] for s in sources}
    assert CM_REPO in repos
    cm = next(s for s in sources if s["repo"] == CM_REPO)
    assert cm["commit_sha"] == CM_SHA
    assert cm["format"] == "firebase_export_json"


def test_import_firebase_qb_export_mini(tmp_path: Path):
    path = _mini_firebase(tmp_path)
    result = import_firebase_qb_export(path, repo="test/mini", commit_sha="abc")
    assert result.metrics["exact_questions"] == 3
    assert result.metrics["source_answers"] == 3
    assert result.artefacts[0].source_family == "github"
    assert result.artefacts[0].metadata.get("not_glassdoor") is True

    questions = [r for r in result.extracted if r.record_type == ExtractionClass.EXACT_QUESTION]
    answers = [
        r for r in result.extracted if r.record_type == ExtractionClass.SOURCE_PROVIDED_ANSWER
    ]
    assert len(questions) == 3
    assert len(answers) == 3
    for q in questions:
        assert q.exact_source_text
        assert q.extracted_metadata["provenance"] == "source_provided"
        assert "glassdoor" not in (q.extracted_metadata.get("source_family") or "")
    for a in answers:
        assert a.extracted_metadata["answer_provenance"] == "source_provided"
        assert a.extracted_metadata.get("question_record_id")


def test_import_staged_capital_markets_if_present():
    if not STAGED_CM.is_file():
        pytest.skip("Capital Markets export not staged under data/staging/github")
    result = import_firebase_qb_export(
        STAGED_CM,
        repo=CM_REPO,
        commit_sha=CM_SHA,
    )
    assert result.metrics["exact_questions"] == 385
    assert result.metrics["source_answers"] == 385
    assert result.artefacts[0].content_hash
    # Provenance must not claim Glassdoor
    for rec in result.extracted[:5]:
        assert rec.extracted_metadata.get("not_glassdoor") is True


def test_import_markdown_questions_fixture():
    path = FIXTURES / "synthetic_markdown_questions.md"
    result = import_markdown_questions(path, repo="fixture/markdown")
    assert result.metrics["exact_questions"] == 5
    assert result.metrics["source_answers"] == 0
    texts = [r.exact_source_text for r in result.extracted]
    assert all("CLICK HERE" not in t.upper() for t in texts)
    assert any("buy-side" in t for t in texts)


def test_import_html_playbook_fixture():
    path = FIXTURES / "synthetic_playbook.html"
    result = import_html_playbook(path, repo="fixture/playbook")
    assert result.metrics["exact_questions"] == 2
    assert result.metrics["source_answers"] == 2
    questions = [r for r in result.extracted if r.record_type == ExtractionClass.EXACT_QUESTION]
    cats = {q.extracted_metadata.get("category") for q in questions}
    assert "Accounting & Financial Statements" in cats
    assert "Enterprise & Equity Value" in cats
    for q in questions:
        assert q.extracted_metadata.get("track") == "M&A / Coverage"


def test_fetch_idempotent(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    payload = b'{"accounting":{"1":{"question":"Q","answer":"A"}}}'
    calls = {"n": 0}

    def fake_download(url: str, timeout: float = 60.0) -> bytes:
        calls["n"] += 1
        return payload

    monkeypatch.setattr(
        "ibpe_corpus.adapters.github.fetch_repo._download_raw",
        fake_download,
    )
    staging = tmp_path / "github"
    first = fetch_github_path(
        "example/repo",
        "deadbeef",
        "data/export.json",
        staging_root=staging,
    )
    assert first.metrics.get("pages_fetched") == 1
    assert calls["n"] == 1
    dest = Path(first.artefacts[0].metadata["staging_path"])
    assert dest.is_file()
    digest = content_hash_file(dest)

    second = fetch_github_path(
        "example/repo",
        "deadbeef",
        "data/export.json",
        staging_root=staging,
    )
    assert second.metrics.get("pages_unchanged") == 1
    assert calls["n"] == 1  # no re-download
    assert second.artefacts[0].content_hash == digest
    assert second.artefacts[0].metadata.get("skipped_idempotent") is True


def test_github_adapter_discover_high_priority():
    adapter = GitHubSourceAdapter(config_path=ROOT / "config" / "github_sources.yml")
    targets = adapter.discover({"import_priority": "high"})
    assert targets
    assert all(t.get("import_priority") == "high" for t in targets)
    assert any(t["repo"] == CM_REPO for t in targets)


def test_github_adapter_parse_local_mini(tmp_path: Path):
    path = _mini_firebase(tmp_path)
    adapter = GitHubSourceAdapter(staging_root=tmp_path / "staging")
    from ibpe_corpus.adapters.github.fetch_repo import _artefact_for_file, content_hash_file

    art = _artefact_for_file(
        repo="test/mini",
        commit_sha="abc",
        rel_path=path.name,
        dest=path,
        digest=content_hash_file(path),
        skipped=False,
        source_url=str(path),
    )
    art.metadata["format"] = "firebase_export_json"
    parsed = adapter.parse_artefact(art)
    assert parsed.metrics["exact_questions"] == 3


@pytest.mark.network
def test_live_download_capital_markets(tmp_path: Path):
    """Optional live raw.githubusercontent.com fetch; skip if network blocked."""
    staging = tmp_path / "github"
    try:
        result = fetch_github_path(
            CM_REPO,
            CM_SHA,
            CM_PATH,
            staging_root=staging,
            force=True,
        )
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"network fetch raised: {exc}")

    if result.access_state.value != "public" or not result.artefacts:
        pytest.skip(f"network fetch unavailable: {result.diagnostics}")

    art = result.artefacts[0]
    path = Path(art.metadata["staging_path"])
    assert path.is_file()
    imported = import_firebase_qb_export(path, artefact=art, repo=CM_REPO, commit_sha=CM_SHA)
    assert imported.metrics["exact_questions"] == 385
    assert imported.metrics["source_answers"] == 385
