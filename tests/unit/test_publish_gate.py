"""Tests for publish gates, firm-signal bank bridge, and reversible joins."""

from __future__ import annotations

import json
from pathlib import Path

from ibpe_corpus.adapters.glassdoor.question_bank import import_question_bank
from ibpe_corpus.canonical.firm_signals import join_firm_signals
from ibpe_corpus.canonical.publish_gate import (
    filter_publishable_answers,
    filter_publishable_questions,
    is_interview_process_placeholder,
)
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    CanonicalQuestion,
    ExtractionClass,
    ExtractedRecord,
    QuestionVariant,
    ValidationStatus,
)


def test_interview_process_placeholder_detection() -> None:
    assert is_interview_process_placeholder("[Interview process] Investment Banking Analyst")
    assert is_interview_process_placeholder("Interview process")
    assert not is_interview_process_placeholder("Walk me through a DCF?")
    assert not is_interview_process_placeholder(
        "Tell me about your interview process and why you chose banking?"
    )


def test_question_bank_is_firm_signal_only(tmp_path: Path) -> None:
    bank = {
        "version": 1,
        "questions": [
            {
                "id": "q1",
                "company": "Goldman Sachs",
                "track": "IB",
                "position": "Analyst",
                "question": "Walk me through a DCF.",
                "process": "Two rounds of interviews with technical focus.",
                "scraped_at": "2026-01-01T00:00:00Z",
            },
            {
                "id": "q2",
                "company": "Blackstone",
                "track": "PE",
                "position": "Associate",
                "question": "[Interview process] Private Equity Associate",
                "scraped_at": "2026-01-01T00:00:00Z",
            },
        ],
    }
    path = tmp_path / "bank.json"
    path.write_text(json.dumps(bank), encoding="utf-8")
    result = import_question_bank(path)
    assert result.metrics["exact_questions"] == 0
    assert result.metrics["topic_signals"] == 1
    assert result.metrics["placeholders_rejected"] == 1
    signals = [r for r in result.extracted if r.record_type == ExtractionClass.TOPIC_SIGNAL]
    assert len(signals) == 1
    meta = signals[0].extracted_metadata
    assert meta["product_role"] == "firm_signal"
    assert meta["contract_provenance"] == "glassdoor_occurrence"
    assert meta["teaching_source"] is False


def test_publishable_filters_withhold_topic_signals() -> None:
    teaching = CanonicalQuestion(canonical_wording="What is WACC?", review_state="accepted")
    signal = CanonicalQuestion(canonical_wording="DCF", review_state="topic_signal")
    placeholder = CanonicalQuestion(
        canonical_wording="[Interview process] Analyst",
        review_state="accepted",
    )
    pub, withheld = filter_publishable_questions([teaching, signal, placeholder])
    assert [q.id for q in pub] == [teaching.id]
    assert {q.id for q in withheld} == {signal.id, placeholder.id}

    ans_ok = Answer(
        canonical_question_id=teaching.id,
        concise_answer="Weighted average cost of capital.",
        expanded_explanation="Blended cost of debt and equity.",
        provenance_type=AnswerProvenance.SOURCE_PROVIDED,
        validation_status=ValidationStatus.PASS,
    )
    ans_bad = Answer(
        canonical_question_id=teaching.id,
        concise_answer="[Interview process] Analyst",
        expanded_explanation="n/a",
        provenance_type=AnswerProvenance.SOURCE_PROVIDED,
    )
    kept, held = filter_publishable_answers([ans_ok, ans_bad], [teaching.id])
    assert len(kept) == 1
    assert kept[0].id == ans_ok.id
    assert len(held) == 1


def test_firm_signal_join_and_reversible_audit() -> None:
    cq = CanonicalQuestion(canonical_wording="Walk me through a DCF", review_state="accepted")
    variant = QuestionVariant(
        canonical_question_id=cq.id,
        source_wording="Walk me through a DCF",
        cleaned_wording="Walk me through a DCF",
        normalised_hash="x" * 64,
        variant_type="exact",
    )
    # Force hash match path via identical wording normalised_hash in join
    from ibpe_corpus.canonical.normalise import normalised_hash

    variant.normalised_hash = normalised_hash("Walk me through a DCF")
    cq.normalised_hash = variant.normalised_hash

    signal = ExtractedRecord(
        source_artefact_id="art_bank",
        exact_source_text="Walk me through a DCF",
        record_type=ExtractionClass.TOPIC_SIGNAL,
        extraction_method="test",
        extracted_metadata={
            "product_role": "firm_signal",
            "contract_provenance": "glassdoor_occurrence",
            "source_family": "glassdoor_question_bank",
            "employer": "JPM",
            "role": "Analyst",
            "bank_question_id": "b1",
        },
    )
    occs, audits = join_firm_signals([cq], [variant], [signal])
    assert len(occs) == 1
    assert occs[0].employer == "JPM"
    assert audits[0]["reversible"] is True
    assert audits[0]["reason"].startswith("firm_signal_join:")
