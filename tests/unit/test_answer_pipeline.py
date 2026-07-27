"""Unit tests for answer acquisition, generation, and validation."""

from __future__ import annotations

import pytest

from ibpe_corpus.answers.classify_response import classify_response
from ibpe_corpus.answers.generate import generate_answer
from ibpe_corpus.answers.ingest_source import (
    ingest_extracted_record,
    ingest_question_response,
)
from ibpe_corpus.answers.match_corpus import (
    ANSWER_REUSE_FUZZ_THRESHOLD,
    find_corpus_match,
)
from ibpe_corpus.answers.pipeline import fill_answers
from ibpe_corpus.answers.validate import (
    assumption_validator,
    independent_validator,
    numerical_validator,
    validate_answer,
)
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    CanonicalQuestion,
    Domain,
    ExtractedRecord,
    ExtractionClass,
    QuestionResponse,
    ResponseType,
    ValidationStatus,
)


def _cq(
    wording: str,
    *,
    qid: str = "cq_test",
    topic: str | None = None,
    nh: str | None = None,
) -> CanonicalQuestion:
    return CanonicalQuestion(
        id=qid,
        canonical_wording=wording,
        topic=topic,
        domain=Domain.IB,
        normalised_hash=nh,
    )


def test_source_answer_never_mislabeled_as_synthesised():
    resp = QuestionResponse(
        question_id="cq_1",
        response_type=ResponseType.COMMUNITY_ANSWER,
        exact_source_text=(
            "Walk through a DCF by projecting unlevered FCF and discounting at WACC."
        ),
        source_provided=True,
        classification_confidence=0.9,
    )
    ans = ingest_question_response(resp, canonical_question_id="cq_1")
    assert ans is not None
    assert ans.provenance_type == AnswerProvenance.SOURCE_PROVIDED
    assert ans.generator_version is None

    record = ExtractedRecord(
        source_artefact_id="art_1",
        exact_source_text="Enterprise value equals equity plus net debt.",
        record_type=ExtractionClass.SOURCE_PROVIDED_ANSWER,
        extraction_method="fixture",
    )
    ans2 = ingest_extracted_record(record, canonical_question_id="cq_2")
    assert ans2 is not None
    assert ans2.provenance_type == AnswerProvenance.SOURCE_PROVIDED


def test_generated_answer_provenance_is_synthesised():
    q = _cq("Walk me through a DCF valuation", topic="dcf")
    ans = generate_answer(q)
    assert ans.provenance_type == AnswerProvenance.SYNTHESISED_UNVALIDATED
    assert ans.provenance_type != AnswerProvenance.SOURCE_PROVIDED
    assert ans.generator_version == "answer-gen-v1"
    assert ans.concise_answer
    assert ans.expanded_explanation
    assert ans.assumptions
    assert ans.calculation_representation is not None
    assert ans.common_mistakes
    assert ans.follow_ups
    assert ans.difficulty


def test_generated_answer_validates_to_synthesised_validated():
    q = _cq("What is WACC?", topic="wacc")
    raw = generate_answer(q)
    validated = validate_answer(raw)
    assert validated.provenance_type == AnswerProvenance.SYNTHESISED_VALIDATED
    assert validated.validation_status in {
        ValidationStatus.PASS,
        ValidationStatus.PASS_WITH_ASSUMPTIONS,
    }


def test_numerical_wacc():
    q = _cq("Calculate WACC", topic="wacc")
    ans = generate_answer(q)
    result = numerical_validator(ans)
    assert result.status == ValidationStatus.PASS
    calc = ans.calculation_representation or {}
    inputs = calc["inputs"]
    expected = calc["expected"]
    w = (
        inputs["equity_weight"] * inputs["cost_of_equity"]
        + inputs["debt_weight"] * inputs["cost_of_debt"] * (1 - inputs["tax_rate"])
    )
    assert abs(w - expected["wacc"]) < 1e-9


def test_numerical_moic_and_irr():
    q = _cq("Explain MOIC and IRR", topic="moic_irr")
    ans = generate_answer(q)
    result = numerical_validator(ans)
    assert result.status == ValidationStatus.PASS
    calc = ans.calculation_representation or {}
    entry = calc["inputs"]["entry_equity"]
    exit_ = calc["inputs"]["exit_equity"]
    years = calc["inputs"]["years"]
    moic = exit_ / entry
    irr = moic ** (1 / years) - 1
    assert abs(moic - calc["expected"]["moic"]) < 1e-9
    assert abs(irr - calc["expected"]["irr_approx"]) < 1e-4


def test_numerical_ev_equals_equity_plus_net_debt():
    q = _cq("Walk through the EV bridge", topic="ev_bridge")
    ans = generate_answer(q)
    result = numerical_validator(ans)
    assert result.status == ValidationStatus.PASS
    calc = ans.calculation_representation or {}
    inp = calc["inputs"]
    net_debt = inp["gross_debt"] - inp["cash"]
    ev = inp["equity_value"] + net_debt
    assert abs(ev - calc["expected"]["enterprise_value"]) < 1e-9
    assert abs(net_debt - calc["expected"]["net_debt"]) < 1e-9


def test_assumption_flags_when_tax_rate_used():
    q = _cq("What is WACC?", topic="wacc")
    ans = generate_answer(q)
    result = assumption_validator(ans)
    assert "tax_rate" in result.flags
    validated = validate_answer(ans)
    assert any("depends_on:tax_rate" in a for a in validated.assumptions)


def test_reject_empty_and_garbage_answers():
    empty = Answer(
        canonical_question_id="cq_x",
        concise_answer="",
        expanded_explanation="",
        provenance_type=AnswerProvenance.SYNTHESISED_UNVALIDATED,
        generator_version="answer-gen-v1",
    )
    out = validate_answer(empty)
    assert out.validation_status == ValidationStatus.REJECT
    assert out.provenance_type == AnswerProvenance.REJECTED

    garbage = Answer(
        canonical_question_id="cq_y",
        concise_answer="n/a",
        expanded_explanation="placeholder",
        provenance_type=AnswerProvenance.SYNTHESISED_UNVALIDATED,
        generator_version="answer-gen-v1",
    )
    out2 = validate_answer(garbage)
    assert out2.validation_status == ValidationStatus.REJECT
    assert independent_validator(garbage).status == ValidationStatus.REJECT


def test_corpus_match_stricter_than_clustering():
    assert ANSWER_REUSE_FUZZ_THRESHOLD >= 90.0


def test_corpus_match_hash_and_fuzz():
    q1 = _cq("Walk me through a DCF", qid="cq_a", nh="hash_dcf")
    q2 = _cq("Walk me through a DCF", qid="cq_b", nh="hash_dcf")
    corpus_ans = Answer(
        canonical_question_id="cq_a",
        concise_answer="Discount projected FCFF at WACC.",
        expanded_explanation="Build FCFF, terminal value, discount, bridge to equity.",
        provenance_type=AnswerProvenance.SOURCE_PROVIDED,
        confidence=0.9,
    )
    match = find_corpus_match(q2, [(q1, corpus_ans)])
    assert match is not None
    assert match.method == "normalised_hash"
    assert match.answer.provenance_type == AnswerProvenance.CORPUS_MATCHED
    assert match.answer.canonical_question_id == "cq_b"


def test_classify_response_community_vs_spam():
    rtype, conf = classify_response(
        "The answer is to walk through unlevered FCF, discount at WACC, "
        "and subtract net debt for equity value."
    )
    assert rtype == ResponseType.COMMUNITY_ANSWER
    assert conf >= 0.5

    rtype2, _ = classify_response("lol")
    assert rtype2 == ResponseType.SPAM_OR_IRRELEVANT


def test_fill_answers_layered():
    cq = _cq("What is WACC?", qid="cq_wacc", topic="wacc")
    source = QuestionResponse(
        question_id="other",
        response_type=ResponseType.COMMUNITY_ANSWER,
        exact_source_text="WACC blends cost of equity and after-tax cost of debt.",
        source_provided=True,
    )
    # No source for cq_wacc → synthesise
    out = fill_answers([cq], [], [source], [])
    assert len(out) == 1
    assert out[0].canonical_question_id == "cq_wacc"
    assert out[0].provenance_type in {
        AnswerProvenance.SYNTHESISED_VALIDATED,
        AnswerProvenance.SYNTHESISED_UNVALIDATED,
    }
    if out[0].validation_status != ValidationStatus.NOT_RUN:
        assert out[0].provenance_type != AnswerProvenance.SOURCE_PROVIDED

    # Source hit for same id
    source2 = QuestionResponse(
        question_id="cq_wacc",
        response_type=ResponseType.COMMUNITY_ANSWER,
        exact_source_text="Source-provided WACC explanation from Glassdoor.",
        source_provided=True,
    )
    out2 = fill_answers([cq], [], [source2], [])
    assert out2[0].provenance_type == AnswerProvenance.SOURCE_PROVIDED


def test_fill_answers_preserves_existing():
    cq = _cq("DCF walkthrough", qid="cq_keep", topic="dcf")
    existing = Answer(
        canonical_question_id="cq_keep",
        concise_answer="Existing answer",
        expanded_explanation="Already stored.",
        provenance_type=AnswerProvenance.SOURCE_PROVIDED,
    )
    out = fill_answers([cq], [existing], [], [])
    assert out[0].concise_answer == "Existing answer"
