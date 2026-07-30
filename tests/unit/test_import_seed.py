"""Offline unit tests for static seed corpus import."""

from __future__ import annotations

from pathlib import Path

import pytest

from ibpe_corpus.adapters.static.seed_corpus import (
    FIXTURE_ORIGIN,
    StaticSeedAdapter,
    ensure_seed_staged,
    load_seed_corpus,
)
from ibpe_corpus.schemas.models import ExtractionClass

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "fixtures" / "corpus" / "seed_ib_pe_questions.json"


@pytest.fixture()
def staging_seed(tmp_path: Path) -> Path:
    dest_dir = tmp_path / "seed"
    ensure_seed_staged(fixture_path=FIXTURE, staging_dir=dest_dir)
    return dest_dir


def test_seed_fixture_exists_and_labeled():
    assert FIXTURE.is_file()
    text = FIXTURE.read_text(encoding="utf-8")
    assert "synthetic_seed" in text
    assert "not_glassdoor" in text


def test_load_seed_corpus_from_fixture(tmp_path: Path):
    result = load_seed_corpus(
        FIXTURE,
        staging_dir=tmp_path / "seed",
        ensure_staged=False,
    )
    assert result.access_state.value == "public"
    assert result.metrics["exact_questions"] >= 15
    assert result.metrics["source_answers"] >= 15
    assert len(result.artefacts) == 1
    art = result.artefacts[0]
    assert art.source_family == "static"
    assert art.metadata.get("fixture_origin") == FIXTURE_ORIGIN
    assert art.metadata.get("not_glassdoor") is True

    questions = [r for r in result.extracted if r.record_type == ExtractionClass.EXACT_QUESTION]
    answers = [
        r for r in result.extracted if r.record_type == ExtractionClass.SOURCE_PROVIDED_ANSWER
    ]
    assert len(questions) == result.metrics["exact_questions"]
    assert len(answers) == result.metrics["source_answers"]
    for q in questions:
        assert q.exact_source_text
        assert q.extracted_metadata.get("fixture_origin") == FIXTURE_ORIGIN
        assert q.extracted_metadata.get("not_glassdoor") is True
        assert "glassdoor" not in q.extracted_metadata.get("provenance", "").lower()
    for a in answers:
        assert a.extracted_metadata.get("answer_provenance") == "source_provided"
        assert a.extracted_metadata.get("question_record_id")


def test_load_seed_from_staging(staging_seed: Path):
    result = load_seed_corpus(staging_dir=staging_seed, fixture_path=FIXTURE)
    assert result.metrics["exact_questions"] >= 15
    staged = staging_seed / FIXTURE.name
    assert staged.is_file()


def test_static_seed_adapter_discover_fetch_parse(tmp_path: Path):
    adapter = StaticSeedAdapter(fixture_path=FIXTURE, staging_dir=tmp_path / "seed")
    targets = adapter.discover()
    assert len(targets) == 1
    fetched = adapter.fetch(targets[0])
    assert fetched.artefacts
    parsed = adapter.parse_artefact(fetched.artefacts[0])
    assert parsed.metrics["exact_questions"] >= 15
