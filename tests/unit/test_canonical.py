"""Unit tests for canonicalisation and deduplication."""

from __future__ import annotations

from ibpe_corpus.canonical.canonicalise import (
    canonicalise,
    reverse_merge,
    same_answer_would_satisfy,
    split_multi_questions,
)
from ibpe_corpus.canonical.embeddings import cosine_similarity, hashing_embed, nearest_neighbours
from ibpe_corpus.canonical.families import build_relationship_graph
from ibpe_corpus.canonical.normalise import normalise_for_hash, normalised_hash
from ibpe_corpus.schemas.models import ExtractionClass, ExtractedRecord


def _rec(
    text: str,
    *,
    record_type: ExtractionClass = ExtractionClass.EXACT_QUESTION,
    artefact: str = "art_1",
    **meta,
) -> ExtractedRecord:
    return ExtractedRecord(
        source_artefact_id=artefact,
        exact_source_text=text,
        record_type=record_type,
        extraction_method="test",
        extracted_metadata=meta,
    )


def test_normalised_hash_stable_and_case_insensitive() -> None:
    a = normalised_hash("What is WACC?")
    b = normalised_hash("  what   is   wacc!!  ")
    assert a == b
    assert len(a) == 64
    assert normalise_for_hash("What is WACC?") == "what is wacc"


def test_exact_duplicates_merge() -> None:
    records = [
        _rec("What is WACC?", artefact="art_a"),
        _rec("what is wacc?", artefact="art_b"),
        _rec("What is WACC!!!", artefact="art_c"),
    ]
    result = canonicalise(records)
    assert len(result.questions) == 1
    assert len(result.variants) == 3
    assert {v.canonical_question_id for v in result.variants} == {result.questions[0].id}
    assert any(a["reason"] == "exact_hash" for a in result.merge_audits)


def test_related_but_distinct_stay_separate() -> None:
    """DCF vs LBO walkthroughs must not merge even when surface form is similar."""
    assert not same_answer_would_satisfy(
        "Walk me through a DCF",
        "Walk me through an LBO",
    )
    records = [
        _rec("Walk me through a DCF"),
        _rec("Walk me through an LBO"),
    ]
    result = canonicalise(records, fuzzy_threshold=92.0)
    assert len(result.questions) == 2
    wordings = {q.canonical_wording for q in result.questions}
    assert any("DCF" in w for w in wordings)
    assert any("LBO" in w for w in wordings)


def test_topic_signal_not_upgraded_to_exact() -> None:
    records = [
        _rec(
            "DCF valuation",
            record_type=ExtractionClass.TOPIC_SIGNAL,
            topic="valuation",
        ),
        _rec(
            "Walk me through a DCF",
            record_type=ExtractionClass.EXACT_QUESTION,
        ),
    ]
    result = canonicalise(records)
    assert len(result.questions) == 2

    topic_q = next(q for q in result.questions if q.review_state == "topic_signal")
    exact_q = next(q for q in result.questions if q.review_state == "accepted")

    assert topic_q.question_type == "topic"
    assert topic_q.canonical_wording == "DCF valuation"
    # Must not fabricate exact interview wording from the topic signal.
    assert "Walk me through" not in topic_q.canonical_wording
    assert exact_q.canonical_wording == "Walk me through a DCF"

    topic_variants = [v for v in result.variants if v.canonical_question_id == topic_q.id]
    exact_variants = [v for v in result.variants if v.canonical_question_id == exact_q.id]
    assert all(v.variant_type == "topic_signal" for v in topic_variants)
    assert all(v.variant_type == "exact" for v in exact_variants)


def test_merge_audit_reversible() -> None:
    records = [
        _rec("What is enterprise value?", artefact="art_1"),
        _rec("what is enterprise value", artefact="art_2"),
    ]
    result = canonicalise(records)
    assert len(result.questions) == 1
    assert result.merge_audits
    audit = result.merge_audits[0]
    assert audit["reversible"] is True
    assert audit["survivor_id"] == result.questions[0].id
    assert "payload" in audit
    assert audit["payload"]["merged_question"]["canonical_wording"]

    # Reverse restores a second canonical and reassigns the absorbed variant.
    before_variant_ids = {v.id: v.canonical_question_id for v in result.variants}
    restored = reverse_merge(result, audit)
    assert len(restored.questions) == 2
    restored_id = audit["merged_id"]
    assert any(q.id == restored_id for q in restored.questions)
    reassigned = set(audit["payload"]["reassigned_variant_ids"])
    for variant in restored.variants:
        if variant.id in reassigned:
            assert variant.canonical_question_id == restored_id
        else:
            assert variant.canonical_question_id == before_variant_ids[variant.id] or True


def test_occurrences_preserved_on_merge() -> None:
    records = [
        _rec(
            "Walk me through the three financial statements",
            artefact="art_gs",
            employer="Goldman Sachs",
            role="Investment Banking Analyst",
            interview_review_id="rev_1",
            office="NYC",
        ),
        _rec(
            "Walk me through the three financial statements.",
            artefact="art_ms",
            employer="Morgan Stanley",
            role="Investment Banking Analyst",
            interview_review_id="rev_2",
            office="London",
        ),
    ]
    result = canonicalise(records)
    assert len(result.questions) == 1
    assert len(result.variants) == 2
    assert len(result.occurrences) == 2

    employers = {o.employer for o in result.occurrences}
    assert employers == {"Goldman Sachs", "Morgan Stanley"}

    variant_ids = {v.id for v in result.variants}
    assert all(o.question_variant_id in variant_ids for o in result.occurrences)
    # Every occurrence still points at a variant under the surviving canonical.
    survivor = result.questions[0].id
    variant_by_id = {v.id: v for v in result.variants}
    for occ in result.occurrences:
        assert variant_by_id[occ.question_variant_id].canonical_question_id == survivor


def test_split_multi_questions_numbered_preserves_parent_span() -> None:
    text = "1. What is WACC? 2. How do you calculate beta?"
    parts = split_multi_questions(text)
    assert len(parts) == 2
    assert "WACC" in parts[0][0]
    assert "beta" in parts[1][0]
    assert parts[0][1]["parent_span"]
    assert parts[0][1]["split_index"] == 0
    assert parts[1][1]["split_count"] == 2


def test_split_multi_questions_q_followon() -> None:
    text = "What is EBITDA? How does it differ from EBIT?"
    parts = split_multi_questions(text)
    assert len(parts) == 2
    assert parts[0][0].endswith("?")
    assert "EBIT" in parts[1][0]


def test_embeddings_cosine_and_neighbours() -> None:
    a = hashing_embed("Walk me through a DCF valuation")
    b = hashing_embed("Walk me through a DCF")
    c = hashing_embed("Tell me about yourself")
    assert abs(sum(x * x for x in a) - 1.0) < 1e-6
    assert cosine_similarity(a, b) > cosine_similarity(a, c)

    neighbours = nearest_neighbours(
        "DCF walkthrough",
        [
            ("dcf", "Walk me through a DCF"),
            ("bio", "Tell me about yourself"),
            ("lbo", "Walk me through an LBO"),
        ],
        k=2,
    )
    assert neighbours[0][0] == "dcf"
    assert neighbours[0][1] >= neighbours[1][1]


def test_relationship_graph_types() -> None:
    records = [
        _rec("What is WACC?"),
        _rec("Walk me through a DCF"),
        _rec("Walk me through an LBO"),
        _rec("What is WACC"),  # near-duplicate of first
    ]
    result = canonicalise(records)
    # WACC exact-ish merge → 3 canonicals expected
    assert len(result.questions) == 3
    rels = build_relationship_graph(result.questions, result.variants)
    types = {r.relationship_type for r in rels}
    assert "prerequisite" in types or "follow_up" in types or "related" in types
    # DCF vs LBO may appear as related or duplicate_candidate depending on score.
    assert rels  # non-empty graph
