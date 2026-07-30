"""Tests for finance calculators, fixtures, enrichment provenance, and enrich job."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from ibpe_corpus.answers.calculators import (
    CalculatorError,
    accretion_dilution,
    run_topic,
    ufcf,
    wacc,
)
from ibpe_corpus.answers.editorial import EditorialReviewQueue, ReviewQueueStatus
from ibpe_corpus.answers.enrich_job import build_graph_slice, run_enrich_batch
from ibpe_corpus.answers.gemini_client import GeminiEnrichClient
from ibpe_corpus.answers.provenance import (
    EnrichmentProvenance,
    ProvenanceError,
    assert_not_source_laundering,
    enforce_answer_provenance,
    label_enrichment_record,
    prefer_corpus_over_synthesis,
)
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    CanonicalQuestion,
    Domain,
)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "finance"


def _load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    "filename",
    [
        "wacc_basic.json",
        "moic_irr_2x_5y.json",
        "ev_bridge_basic.json",
        "paper_lbo_exit.json",
        "ufcf_basic.json",
    ],
)
def test_finance_fixtures_match_calculators(filename: str):
    fx = _load_fixture(filename)
    got = run_topic(fx["topic"], fx["inputs"])
    for key, exp in fx["expected"].items():
        assert key in got
        assert abs(got[key] - exp) < 1e-6, f"{filename}:{key} {got[key]} != {exp}"


def test_wacc_rejects_bad_tax():
    with pytest.raises(CalculatorError):
        wacc(
            equity_weight=0.5,
            cost_of_equity=0.1,
            debt_weight=0.5,
            cost_of_debt=0.05,
            tax_rate=1.5,
        )


def test_accretion_dilution_sign():
    out = accretion_dilution(acquirer_eps=2.0, combined_eps=2.2)
    assert out["accretive"] == 1.0
    assert abs(out["eps_delta"] - 0.1) < 1e-9


def test_ufcf_identity():
    assert abs(ufcf(ebit=100, tax_rate=0.25, da=20, capex=30, delta_nwc=5) - 60.0) < 1e-9


def test_gemini_cannot_be_labelled_glassdoor():
    with pytest.raises(ProvenanceError):
        assert_not_source_laundering(
            provenance="glassdoor",
            model_version="google/gemini-2.5-flash",
        )


def test_gemini_cannot_claim_missing_github_path():
    with pytest.raises(ProvenanceError):
        assert_not_source_laundering(
            provenance="gemini_synthesised",
            model_version="google/gemini-2.5-flash",
            claimed_github_path="repo/answers.md",
            github_path_contained_text=False,
        )


def test_enforce_strips_source_provided_on_generated():
    ans = Answer(
        canonical_question_id="cq_x",
        concise_answer="WACC is the blended cost of capital.",
        expanded_explanation="Equity and after-tax debt cost weighted by capital structure.",
        provenance_type=AnswerProvenance.SOURCE_PROVIDED,
        generator_version="answer-gen-v1",
        source_ids=[],
    )
    fixed = enforce_answer_provenance(ans)
    assert fixed.provenance_type != AnswerProvenance.SOURCE_PROVIDED


def test_prefer_corpus_over_synthesis():
    corpus = Answer(
        canonical_question_id="cq_1",
        concise_answer="Enterprise value equals equity plus net debt.",
        expanded_explanation="Start from equity value, add net debt and other claims.",
        provenance_type=AnswerProvenance.SOURCE_PROVIDED,
        source_ids=["resp_1"],
    )
    synth = Answer(
        canonical_question_id="cq_1",
        concise_answer="EV is equity plus net debt (synthesised).",
        expanded_explanation="A generated explanation that must not win over corpus.",
        provenance_type=AnswerProvenance.SYNTHESISED_UNVALIDATED,
        generator_version="answer-gen-v1",
    )
    chosen = prefer_corpus_over_synthesis(corpus, synth)
    assert chosen is not None
    assert chosen.provenance_type == AnswerProvenance.SOURCE_PROVIDED
    assert "synthesised" not in chosen.concise_answer.lower()


def test_label_enrichment_record_stamps_provenance():
    stamped = label_enrichment_record(
        {"topic": "wacc", "glassdoor_answer_id": "bad"},
        model_version="google/gemini-2.5-flash",
        prompt_version="enrich-v1",
    )
    assert stamped["provenance"] == EnrichmentProvenance.GEMINI_SYNTHESISED.value
    assert stamped["product_role"] == "enrichment"
    assert "glassdoor_answer_id" not in stamped


def test_enrich_job_dry_run_builds_mode_graphs():
    qs = [
        CanonicalQuestion(
            id="cq_wacc",
            canonical_wording="What is WACC?",
            topic="wacc",
            domain=Domain.IB,
        ),
        CanonicalQuestion(
            id="cq_lbo",
            canonical_wording="Walk through a paper LBO",
            topic="paper_lbo",
            domain=Domain.PE,
        ),
    ]
    client = GeminiEnrichClient(dry_run=True)
    graph, queue, metrics = run_enrich_batch(qs, client=client, limit=2)
    assert metrics["proposals"] == 2
    assert metrics["company_prep_nodes"] >= 2
    assert metrics["concept_lab_nodes"] >= 2
    assert all(
        p.provenance == EnrichmentProvenance.GEMINI_SYNTHESISED for p in graph.proposals
    )
    assert all(
        n.provenance == EnrichmentProvenance.GEMINI_SYNTHESISED for n in graph.company_prep
    )
    assert all(
        n.provenance == EnrichmentProvenance.GEMINI_SYNTHESISED for n in graph.concept_lab
    )
    # Low confidence heuristic → review queue
    assert len(queue.list_pending()) >= 1
    slice2 = build_graph_slice(graph.proposals)
    assert len(slice2.company_prep) == len(graph.company_prep)


def test_editorial_queue_stub():
    q = EditorialReviewQueue()
    item = q.enqueue(
        canonical_question_id="cq_1",
        reason="needs_human_gold",
        priority=5,
    )
    assert item.provenance == EnrichmentProvenance.EDITORIAL
    assert item.status == ReviewQueueStatus.PENDING
    approved = q.transition(item.id, ReviewQueueStatus.APPROVED, notes="ok")
    assert approved.status == ReviewQueueStatus.APPROVED
    assert q.list_pending() == []
