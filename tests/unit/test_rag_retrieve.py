"""Tests for supplemental RAG retrieval."""

from __future__ import annotations

from ibpe_corpus.answers.rag_retrieve import require_guide_anchor, retrieve_rag_chunks


def test_retrieve_rag_chunks_lexical():
    corpus = [
        {
            "id": "gh1",
            "text": "Walk me through a DCF valuation using unlevered free cash flow.",
            "provenance": "github_source",
        },
        {
            "id": "gd1",
            "text": "What is your experience with Excel models?",
            "provenance": "glassdoor_occurrence",
        },
    ]
    hits = retrieve_rag_chunks("Walk me through a DCF", corpus=corpus, top_k=2)
    assert hits
    assert hits[0]["provenance"] == "github_source"


def test_require_guide_anchor_blocks_glassdoor_only():
    assert not require_guide_anchor(
        [{"id": "g", "provenance": "glassdoor_occurrence", "text": "x"}]
    )
    assert require_guide_anchor(
        [
            {"id": "g", "provenance": "glassdoor_occurrence", "text": "x"},
            {"id": "gh", "provenance": "github_source", "text": "y"},
        ]
    )
