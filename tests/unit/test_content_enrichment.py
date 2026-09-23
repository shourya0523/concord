"""Content track (plan 2026-09-23-001): P1.2–P1.5, P2.1–P2.4, P2.7, P2.11."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from ibpe_corpus.adapters.github.importers import (
    import_html_playbook,
    import_markdown_questions,
    import_markdown_table_titles,
)
from ibpe_corpus.adapters.static.behavioural_seed import (
    behavioural_answers,
    load_behavioural_seed,
)
from ibpe_corpus.answers.calculators import (
    carried_interest,
    dcf_enterprise_value,
    depreciation_flow,
    implied_valuation,
    leverage_metrics,
    net_working_capital,
    run_topic,
)
from ibpe_corpus.answers.depth import propose_expansions
from ibpe_corpus.answers.editorial import EditorialReviewQueue, ReviewQueueStatus
from ibpe_corpus.answers.generate import (
    PLACEHOLDER_PREFIX,
    generate_answer,
    is_placeholder_answer,
    route_topic,
)
from ibpe_corpus.answers.ingest_source import ingest_extracted_record, split_concise_expanded
from ibpe_corpus.answers.pipeline import fill_answers
from ibpe_corpus.answers.proposals import ProposalStore, load_proposals_jsonl, proposal_id
from ibpe_corpus.answers.rubric import (
    attach_rubrics,
    build_rubric,
    derive_question_calc,
    heuristic_rubric,
    numeric_checks_from_calc,
    validate_rubric,
)
from ibpe_corpus.answers.taxonomy_enrich import (
    SourceHints,
    apply_approved,
    propose_taxonomy,
    run_taxonomy_enrichment,
)
from ibpe_corpus.answers.validate import NEEDS_EXPANSION_TAG, validate_answer
from ibpe_corpus.canonical.canonicalise import canonicalise
from ibpe_corpus.canonical.firm_signals import (
    join_firm_signals,
    llm_topic_tagger,
    signal_join_summary,
)
from ibpe_corpus.canonical.normalise import (
    has_question_prefix,
    normalised_hash,
    strip_question_prefix,
)
from ibpe_corpus.canonical.publish_gate import (
    answer_withhold_reason,
    filter_publishable_answers,
)
from ibpe_corpus.canonical.taxonomy_rules import (
    classify_taxonomy,
    infer_topic,
    normalise_difficulty,
)
from ibpe_corpus.metrics.completeness import compute_metrics, write_license_review
from ibpe_corpus.orchestration.id_registry import PriorIds, assign_stable_ids, load_prior_ids
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    AnswerRubric,
    CanonicalQuestion,
    Domain,
    ExtractedRecord,
    ExtractionClass,
    QuestionVariant,
    RubricKeyPoint,
    RubricNumericCheck,
    ValidationStatus,
)
from ibpe_corpus.storage.db import CorpusStore

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "fixtures" / "corpus"


def _q(wording: str, qid: str = "cq_t", **kw) -> CanonicalQuestion:
    return CanonicalQuestion(id=qid, canonical_wording=wording, **kw)


def _src_answer(qid: str, concise: str, expanded: str | None = None, **kw) -> Answer:
    return Answer(
        canonical_question_id=qid,
        concise_answer=concise,
        expanded_explanation=expanded if expanded is not None else concise,
        provenance_type=AnswerProvenance.SOURCE_PROVIDED,
        source_ids=["raw_1", "art_1"],
        **kw,
    )


# --------------------------------------------------------------------------- #
# P1.2 prefix strip                                                            #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Question 12: What is WACC?", "What is WACC?"),
        ("Question 3. Walk me through a DCF.", "Walk me through a DCF."),
        ("question #4 - Why banking?", "Why banking?"),
        ("Q7) What is EBITDA?", "What is EBITDA?"),
        ("  Question 1:   Tell me about yourself. ", "Tell me about yourself."),
        ("Question 2: Q2. Double numbered?", "Double numbered?"),
    ],
)
def test_strip_question_prefix(raw: str, expected: str) -> None:
    assert strip_question_prefix(raw) == expected
    assert not has_question_prefix(strip_question_prefix(raw))


def test_strip_question_prefix_leaves_real_text_alone() -> None:
    assert strip_question_prefix("Q3 earnings missed — what happens to the stock?").startswith("Q3 earnings")
    assert strip_question_prefix("Question 5:") == "Question 5:"  # never empties
    assert strip_question_prefix("What is question 5 about?") == "What is question 5 about?"


def test_hash_ignores_prefix() -> None:
    assert normalised_hash("Question 9: Why are we your first choice?") == normalised_hash(
        "Why are we your first choice?"
    )


def _rec(text: str, meta: dict | None = None, kind=ExtractionClass.EXACT_QUESTION) -> ExtractedRecord:
    return ExtractedRecord(
        source_artefact_id="art_x",
        exact_source_text=text,
        record_type=kind,
        extraction_method="test",
        extracted_metadata=meta or {},
    )


def test_canonicalise_strips_prefix_and_keeps_paired_compound_whole() -> None:
    paired = _rec(
        "Question 20: Would a seller prefer a stock purchase or an asset purchase? What about the buyer?",
        {"has_source_answer": True, "pair_id": "p1"},
    )
    unpaired = _rec("What is EBITDA? Why do bankers use it so often in valuation?")
    result = canonicalise([paired, unpaired])
    wordings = sorted(q.canonical_wording for q in result.questions)
    assert (
        "Would a seller prefer a stock purchase or an asset purchase? What about the buyer?" in wordings
    )
    assert not any(w.lower().startswith("question") for w in wordings)
    # Unpaired multi-question records still split (Glassdoor-style behaviour).
    assert "What is EBITDA?" in wordings


def test_canonical_provenance_and_difficulty_from_meta() -> None:
    rec = _rec(
        "What is a greenshoe?",
        {"contract_provenance": "github_source", "difficulty": "Expert"},
    )
    q = canonicalise([rec]).questions[0]
    assert q.provenance == "github_source"
    assert q.difficulty == "hard"
    assert normalise_difficulty("Foundational") == "easy"
    assert normalise_difficulty("Core") == "medium"
    assert normalise_difficulty("weird") is None


# --------------------------------------------------------------------------- #
# P1.3 placeholders / P1.4 depth tags                                          #
# --------------------------------------------------------------------------- #


def test_generic_handler_is_needs_generation_and_withheld() -> None:
    q = _q("What's your favourite colour?")
    raw = generate_answer(q)
    assert raw.concise_answer.startswith(PLACEHOLDER_PREFIX)
    assert raw.validation_status == ValidationStatus.NEEDS_GENERATION
    validated = validate_answer(raw)
    assert validated.validation_status == ValidationStatus.NEEDS_GENERATION
    assert validated.provenance_type == AnswerProvenance.NEEDS_REVIEW
    assert validated.provenance_type != AnswerProvenance.SYNTHESISED_VALIDATED
    assert is_placeholder_answer(validated)
    kept, held = filter_publishable_answers([validated], [q.id])
    assert kept == [] and len(held) == 1
    assert answer_withhold_reason(validated) in {"placeholder_template", "needs_generation"}


def test_publish_gate_rejects_placeholder_text_even_if_marked_validated() -> None:
    ans = Answer(
        canonical_question_id="cq_1",
        concise_answer="Structure a clear interview answer to: What is a DCF?",
        expanded_explanation="State the definition or framework first.",
        provenance_type=AnswerProvenance.SYNTHESISED_VALIDATED,
        validation_status=ValidationStatus.PASS,
    )
    assert answer_withhold_reason(ans) == "placeholder_template"


def test_expanded_equals_concise_tagged_but_publishable() -> None:
    ans = _src_answer("cq_d", "EBITDA is earnings before interest, taxes, depreciation and amortisation.")
    out = validate_answer(ans)
    assert NEEDS_EXPANSION_TAG in out.quality_tags
    assert out.provenance_type == AnswerProvenance.SOURCE_PROVIDED
    kept, _ = filter_publishable_answers([out], ["cq_d"])
    assert kept


def test_fill_answers_validates_existing_source_answers() -> None:
    q = _q("What is EBITDA?", qid="cq_e")
    ans = _src_answer("cq_e", "EBITDA is a proxy for operating cash flow before capex and taxes.")
    out = fill_answers([q], [ans], [], [])
    assert out[0].validation_status in {ValidationStatus.PASS, ValidationStatus.PASS_WITH_ASSUMPTIONS}
    assert out[0].provenance_type == AnswerProvenance.SOURCE_PROVIDED


# --------------------------------------------------------------------------- #
# P2.4 topic handlers                                                          #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "wording,topic",
    [
        ("What does negative working capital mean?", "working_capital"),
        ("What are some examples of incurrence covenants?", "debt_credit"),
        ("How do comparable companies differ from precedent transactions?", "comps_precedents"),
        ("Why might two companies trade at different EV/EBITDA multiples?", "valuation_multiples"),
        ("How is carried interest calculated in a PE fund?", "pe_fund"),
        ("Walk me through a DCF.", "dcf"),
        ("What is WACC?", "wacc"),
        ("Walk me through the EV bridge from equity value.", "ev_bridge"),
        ("Is this merger accretive or dilutive?", "accretion_dilution"),
        ("Walk me through a paper LBO.", "paper_lbo"),
        ("How does goodwill get created?", "three_statements"),
        ("Tell me about a time you failed.", "behavioural"),
        ("Why investment banking?", "behavioural"),
        ("What are the steps in a sell-side auction?", "ma_process"),
        ("What happens in Chapter 11?", "restructuring"),
        ("How would you value a company?", "valuation_overview"),
    ],
)
def test_topic_handlers_route_and_validate(wording: str, topic: str) -> None:
    q = _q(wording)
    assert route_topic(q) == topic
    ans = validate_answer(generate_answer(q))
    assert ans.provenance_type == AnswerProvenance.SYNTHESISED_VALIDATED
    assert ans.validation_status in {ValidationStatus.PASS, ValidationStatus.PASS_WITH_ASSUMPTIONS}
    assert not ans.concise_answer.startswith(PLACEHOLDER_PREFIX)
    assert ans.expanded_explanation != ans.concise_answer
    assert ans.common_mistakes and ans.follow_ups


def test_facets_answer_the_specific_question() -> None:
    ans = generate_answer(_q("What does negative Working Capital mean? Is that a bad sign?"))
    assert ans.concise_answer.startswith("Negative working capital")
    ans2 = generate_answer(_q("How does $10 of depreciation flow through the statements at a 40% tax rate?"))
    calc = ans2.calculation_representation or {}
    assert calc["inputs"] == {"depreciation": 10.0, "tax_rate": 0.4}
    assert calc["expected"]["net_income_change"] == pytest.approx(-6.0)
    assert calc["expected"]["cash_change"] == pytest.approx(4.0)


def test_new_calculators() -> None:
    dcf = dcf_enterprise_value(fcff=[100, 110, 120], wacc=0.10, terminal_growth=0.02)
    assert dcf["terminal_value"] == pytest.approx(1530.0)
    assert dcf["enterprise_value"] == pytest.approx(1421.48, abs=0.05)
    assert implied_valuation(multiple=8, metric=100, net_debt=200) == {
        "implied_enterprise_value": 800.0,
        "implied_equity_value": 600.0,
    }
    nwc = net_working_capital(current_operating_assets=300, current_operating_liabilities=180, prior_nwc=100)
    assert nwc["delta_nwc"] == 20 and nwc["cash_impact"] == -20
    lev = leverage_metrics(total_debt=500, ebitda=100, cash=50, interest_expense=40)
    assert (lev["gross_leverage"], lev["net_leverage"], lev["interest_coverage"]) == (5.0, 4.5, 2.5)
    flow = depreciation_flow(amount=10, tax_rate=0.25)
    assert flow["net_income_change"] == -7.5 and flow["cash_change"] == 2.5
    carry = carried_interest(fund_size=1000, total_distributions=2000)
    assert carry["gp_carry"] == 200 and carry["net_moic"] == pytest.approx(1.8)
    assert run_topic("working_capital", {"current_operating_assets": 1, "current_operating_liabilities": 2})[
        "nwc"
    ] == -1


# --------------------------------------------------------------------------- #
# P1.5 playbook ingest                                                         #
# --------------------------------------------------------------------------- #


def test_playbook_mapping_deep_dive_red_flag_coaching() -> None:
    result = import_html_playbook(FIXTURES / "synthetic_playbook.html", repo="fixture/playbook")
    answer_rec = next(r for r in result.extracted if r.record_type == ExtractionClass.SOURCE_PROVIDED_ANSWER)
    ans = ingest_extracted_record(answer_rec, canonical_question_id="cq_pb")
    assert ans is not None
    assert ans.provenance_type == AnswerProvenance.SOURCE_PROVIDED
    assert ans.concise_answer.startswith("On the Income Statement")
    assert "Depreciation tax shield equals $2.50." in ans.expanded_explanation
    assert ans.expanded_explanation != ans.concise_answer
    assert ans.common_mistakes == ["Forgetting the tax effect."]
    assert ans.coaching_notes == ["Follow IS then CFS then BS."]
    assert ans.difficulty == "easy"


@pytest.mark.parametrize("slug", ["ib_vc", "pe_vc"])
def test_staged_coryjburk_playbooks_parse(slug: str) -> None:
    path = ROOT / "data" / "staging" / "github" / f"coryjburk_intv-playbook-{slug}" / "index.html"
    if not path.is_file():
        pytest.skip("coryjburk playbook not staged")
    result = import_html_playbook(path)
    assert result.metrics["exact_questions"] == 100
    assert result.metrics["source_answers"] == 100
    ans = [r for r in result.extracted if r.record_type == ExtractionClass.SOURCE_PROVIDED_ANSWER]
    assert all(r.extracted_metadata.get("deepdive") for r in ans)


def test_markdown_title_labels_and_role_track(tmp_path: Path) -> None:
    table = tmp_path / "README.md"
    table.write_text(
        "| # | Company | Question | Category | Difficulty |\n|---|---|---|---|---|\n"
        "| 1 | **JPMorgan Chase** | M&A: Accretion/Dilution with a Stock-for-Stock Transaction | Finance | Hard |\n",
        encoding="utf-8",
    )
    rec = import_markdown_table_titles(table).extracted[0]
    assert rec.extracted_metadata["title_label"] == "M&A"
    assert rec.extracted_metadata["company"] == "JPMorgan Chase"
    md = tmp_path / "Private Equity Analyst.md"
    md.write_text("## Sample\n\n1. What is an LBO?\n2. [CLICK HERE](https://x)\n", encoding="utf-8")
    recs = import_markdown_questions(md).extracted
    assert len(recs) == 1 and recs[0].extracted_metadata["track"] == "Private Equity Analyst"


def test_split_concise_expanded_is_extractive() -> None:
    text = (
        "Enterprise value is the value of the core business to all capital providers. "
        "Equity value is the value to common shareholders only. You bridge between them with "
        "net debt, preferred stock and non-controlling interest, using diluted shares for equity. "
        "Always keep the numerator and denominator consistent when you build multiples."
    )
    concise, expanded = split_concise_expanded(text)
    assert expanded == " ".join(text.split())
    assert concise != expanded and expanded.startswith(concise)
    short = "EBITDA is a proxy for operating cash flow."
    assert split_concise_expanded(short) == (short, short)


# --------------------------------------------------------------------------- #
# P2.2 taxonomy                                                                #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "text,topic",
    [
        ("Walk me through a DCF", "valuation"),
        ("How would a DCF differ for a distressed company?", "restructuring"),
        ("What is negative working capital?", "working_capital"),
        ("Tell me about a time you led a team", "behavioral"),
        ("Why are we your first choice?", "behavioral"),
        ("Explain the greenshoe option", "capital_structure"),
        ("What is carried interest?", "returns"),
        ("How would you reduce DSO at a portfolio company?", "working_capital"),
        ("Walk me through a paper LBO", "lbo"),
        ("Pitch me a stock", "investment_thesis"),
        ("favourite colour?", "untagged"),
    ],
)
def test_keyword_rules_v4(text: str, topic: str) -> None:
    assert infer_topic(text) == topic


def test_classifier_agreement_and_nesting() -> None:
    agree = classify_taxonomy("Walk me through a DCF", source_category="dcf", source_answer_text="Discount FCF at WACC")
    assert agree.topic == "valuation" and agree.topic_auto_approvable
    nested = classify_taxonomy(
        "What is working capital? How is it used?",
        source_category="accounting",
        source_answer_text="Working capital is current assets minus current liabilities.",
    )
    assert nested.topic == "working_capital" and nested.topic_auto_approvable
    single = classify_taxonomy("What is a greenshoe?")
    assert single.topic == "capital_structure" and not single.topic_auto_approvable
    disagree = classify_taxonomy(
        "What is your personal beta?", source_category="outside-the-box", source_answer_text="I am calm."
    )
    assert disagree.topic == "behavioral" and not disagree.topic_agrees


def test_domain_resolution() -> None:
    pe_accounting = classify_taxonomy(
        "Walk me through a $50M capex increase on the three statements",
        source_category="Accounting & Financial Statement Analysis",
        source_track="Investment",
    )
    assert pe_accounting.domain == "both"  # topic maps ib, track says pe → cross-track
    ib = classify_taxonomy("Walk me through a DCF", source_track="M&A / Coverage", source_category="Valuation & DCF")
    assert ib.domain == "ib" and ib.domain_confidence >= 0.9


def test_taxonomy_proposals_persist_and_apply(tmp_path: Path) -> None:
    store = CorpusStore(tmp_path / "c.db")
    qs = [
        _q("Walk me through a DCF", qid="cq_a"),
        _q("What is a greenshoe?", qid="cq_b"),
        _q("Already tagged", qid="cq_c", topic="lbo", domain=Domain.PE, difficulty="hard"),
    ]
    hints = {"cq_a": SourceHints(category="dcf", track="M&A / Coverage", difficulty="Core",
                                 answer_text="Project FCF, discount at WACC, add terminal value")}
    updated, props, metrics = run_taxonomy_enrichment(
        qs, hints, proposal_store=ProposalStore(store), review_queue=EditorialReviewQueue(store)
    )
    by_id = {q.id: q for q in updated}
    assert by_id["cq_a"].topic == "valuation" and by_id["cq_a"].domain == Domain.IB
    assert by_id["cq_a"].difficulty == "medium"
    assert by_id["cq_b"].topic is None  # single signal → pending, not applied
    assert not [p for p in props if p.target_id == "cq_c"]
    assert metrics["taxonomy_pending"] >= 1 and metrics["taxonomy_auto_approved"] >= 2
    # Durable: a fresh store sees the same rows; pending rows are in the review queue.
    again = ProposalStore(CorpusStore(tmp_path / "c.db")).list()
    assert {p.id for p in again} == {p.id for p in props}
    queue = EditorialReviewQueue(CorpusStore(tmp_path / "c.db"))
    assert any(i.reason.startswith("taxonomy_") for i in queue.list_pending())


def test_human_decision_survives_rerun(tmp_path: Path) -> None:
    store = ProposalStore(CorpusStore(tmp_path / "c.db"))
    q = _q("What is a greenshoe?", qid="cq_g")
    props = store.upsert_many(propose_taxonomy([q], {}))
    topic = next(p for p in props if p.field == "topic")
    assert topic.status == "pending"
    store.decide(topic.id, "approved", reviewer="analyst@example.com", note="looks right")
    rerun = store.upsert_many(propose_taxonomy([q], {}))
    kept = next(p for p in rerun if p.field == "topic")
    assert kept.status == "approved" and kept.reviewer == "analyst@example.com"
    updated, applied = apply_approved([q], rerun)
    assert updated[0].topic == "capital_structure" and applied >= 1
    path = tmp_path / "props.jsonl"
    store.export_jsonl(path)
    assert {p.id for p in load_proposals_jsonl(path)} >= {topic.id}
    assert topic.id == proposal_id("question", "cq_g", "topic", topic.prompt_version)


class _FakeLlmClient:
    dry_run = False
    model = "google/gemini-test"

    def __init__(self, topic: str, confidence: float) -> None:
        self.topic, self.confidence = topic, confidence

    def propose(self, question):
        from ibpe_corpus.answers.enrich_models import EnrichmentProposal

        return EnrichmentProposal(
            canonical_question_id=question.id,
            topic=self.topic,
            track="IB",
            difficulty="medium",
            confidence=self.confidence,
            model_version=self.model,
            prompt_version="enrich-v1",
        )


def test_taxonomy_llm_path_requires_rule_agreement() -> None:
    q = _q("Walk me through a DCF", qid="cq_l")
    ok = propose_taxonomy([q], {}, client=_FakeLlmClient("DCF", 0.9))
    topic = next(p for p in ok if p.field == "topic")
    assert topic.prompt_version == "enrich-v1" and topic.status == "approved"
    assert topic.proposal_json["value"] == "valuation"
    bad = propose_taxonomy([q], {}, client=_FakeLlmClient("lbo", 0.95))
    assert next(p for p in bad if p.field == "topic").status == "pending"


def test_editorial_queue_transition_persists(tmp_path: Path) -> None:
    store = CorpusStore(tmp_path / "q.db")
    queue = EditorialReviewQueue(store)
    item = queue.enqueue(canonical_question_id="cq_1", reason="r", item_id="edq_fixed")
    queue.transition(item.id, ReviewQueueStatus.APPROVED, assignee="ed")
    reloaded = EditorialReviewQueue(store).get("edq_fixed")
    assert reloaded is not None and reloaded.status == ReviewQueueStatus.APPROVED


# --------------------------------------------------------------------------- #
# P2.3 rubrics                                                                 #
# --------------------------------------------------------------------------- #

_LONG_SOURCE = (
    "On the Income Statement, operating income falls by $10, and net income falls by $7.50 after "
    "the 25% tax shield. On the Cash Flow Statement, net income starts $7.50 lower, but the $10 of "
    "depreciation is added back as non-cash, so cash rises by $2.50. On the Balance Sheet, cash is up "
    "$2.50 and PP&E is down $10, so assets fall $7.50, matching the drop in retained earnings."
)


def test_heuristic_rubric_validators_and_shape() -> None:
    q = _q("Walk me through how $10 of depreciation flows through the three statements at a 25% tax rate.")
    ans = _src_answer(q.id, _LONG_SOURCE, common_mistakes=["Forgetting the tax effect"])
    rubric = build_rubric(ans, q)
    assert rubric.review_status == "approved" and rubric.provenance == "heuristic"
    assert 2 <= len(rubric.key_points) <= 6
    assert abs(sum(k.weight for k in rubric.key_points) - 1.0) <= 0.01
    assert sum(1 for k in rubric.key_points if k.must_have) >= 1
    assert all(k.text in _LONG_SOURCE for k in rubric.key_points)  # extractive
    assert rubric.red_flags == ["Forgetting the tax effect"]
    assert len(rubric.follow_ups) >= 2
    # Derived numeric checks agree with the answer text and recompute.
    assert {c.id for c in rubric.numeric_checks} == {"net_income_change", "cash_change"}
    assert rubric.kind == "technical"  # walkthrough: key points + numeric checks
    assert validate_rubric(rubric, answer=ans) == []


def test_rubric_rejects_bad_weights_and_numeric_mismatch() -> None:
    bad = AnswerRubric(
        key_points=[RubricKeyPoint(id="k1", text="a", weight=0.5, must_have=False)],
        provenance="heuristic",
    )
    errors = validate_rubric(bad)
    assert any(e.startswith("weights_sum") for e in errors) and "no_must_have" in errors
    mismatch = AnswerRubric(
        key_points=[RubricKeyPoint(id="k1", text="WACC", weight=1.0, must_have=True)],
        numeric_checks=[
            RubricNumericCheck(
                id="wacc", label="wacc", calculator="wacc",
                inputs={"equity_weight": 0.6, "cost_of_equity": 0.1, "debt_weight": 0.4,
                        "cost_of_debt": 0.05, "tax_rate": 0.25},
                expected=9.9, unit="%",
            )
        ],
        provenance="heuristic",
    )
    assert "numeric_recompute_failed:wacc" in validate_rubric(mismatch)
    ans = validate_answer(generate_answer(_q("What is WACC?")))
    ans.calculation_representation["expected"]["wacc"] = 0.2  # type: ignore[index]
    checks, errs = numeric_checks_from_calc(ans.calculation_representation)
    assert not checks and errs and errs[0].startswith("numeric_mismatch")
    assert build_rubric(ans, _q("What is WACC?")).review_status == "rejected"


def test_numeric_checks_only_for_computational_questions() -> None:
    q = _q("What is WACC?")
    rubric = heuristic_rubric(validate_answer(generate_answer(q)), q)
    assert rubric.numeric_checks == [] and rubric.kind == "technical"
    q2 = _q("Calculate WACC with 60% equity at 10% and 40% debt at 5%, 25% tax.")
    r2 = heuristic_rubric(validate_answer(generate_answer(q2)), q2)
    assert r2.kind == "numeric"
    assert r2.numeric_checks[0].expected == pytest.approx(7.5) and r2.numeric_checks[0].unit == "%"
    assert derive_question_calc(q, _src_answer(q.id, "WACC blends costs.")) is None


def test_star_and_motivation_rubrics() -> None:
    q = _q("Tell me about a time you failed.", topic="behavioral")
    rubric = build_rubric(validate_answer(generate_answer(q)), q)
    assert rubric.kind == "star" and rubric.review_status == "approved"
    texts = [k.text.split(":")[0] for k in rubric.key_points]
    assert texts == ["Situation", "Task", "Action", "Result", "Reflection"]
    assert {k.text.split(":")[0] for k in rubric.key_points if k.must_have} == {"Action", "Result"}
    why = _q("Why our firm?", topic="behavioral")
    mot = build_rubric(validate_answer(generate_answer(why)), why)
    assert mot.kind == "star" and "specific" in mot.key_points[0].text


def test_llm_rubric_injected_call() -> None:
    q = _q("What is enterprise value?")
    ans = _src_answer(
        q.id,
        "Enterprise value is the value of the operating business to all capital providers.",
        "Enterprise value is the value of the operating business to all capital providers. "
        "It equals equity value plus net debt, preferred stock and non-controlling interest.",
    )
    good = {
        "kind": "technical",
        "key_points": [
            {"id": "k1", "text": "Defines EV as value to all capital providers", "weight": 0.6,
             "must_have": True, "cues": ["all capital providers"]},
            {"id": "k2", "text": "Bridge: equity value plus net debt", "weight": 0.4,
             "must_have": False, "cues": ["net debt"]},
        ],
        "red_flags": ["Subtracts debt"],
        "follow_ups": ["Why subtract cash?", "Where does NCI go?"],
    }
    r = build_rubric(ans, q, llm_call=lambda prompt: good, model="gemini-test")
    assert r.provenance == "llm" and r.review_status == "approved" and r.prompt_version == "rubric-v1"
    ungrounded = json.loads(json.dumps(good))
    ungrounded["key_points"][1]["cues"] = ["merger arbitrage"]
    ungrounded["key_points"][1]["text"] = "Something not in the answer"
    r2 = build_rubric(ans, q, llm_call=lambda prompt: ungrounded)
    assert r2.provenance == "heuristic"

    def boom(prompt: str) -> dict:
        raise RuntimeError("network down")

    assert build_rubric(ans, q, llm_call=boom).provenance == "heuristic"


def test_rubric_mirrors_ts_contract_fields() -> None:
    ts = (ROOT / "packages" / "contracts" / "src" / "learning-loop.ts").read_text(encoding="utf-8")

    def keys(schema: str) -> set[str]:
        body = re.search(rf"export const {schema} = z\.object\(\{{(.*?)\n\}}\);", ts, re.S)
        assert body, schema
        return set(re.findall(r"^\s{2}(\w+):", body.group(1), re.M))

    assert keys("AnswerRubricSchema") == set(AnswerRubric.model_fields)
    assert keys("RubricKeyPointSchema") == set(RubricKeyPoint.model_fields)
    assert keys("RubricNumericCheckSchema") == set(RubricNumericCheck.model_fields)


def test_attach_rubrics_placeholder_rejected() -> None:
    q = _q("What's your favourite colour?", qid="cq_p")
    ans = validate_answer(generate_answer(q))
    out, stats = attach_rubrics([ans], [q])
    assert out[0].rubric is not None and out[0].rubric.review_status == "rejected"
    assert stats["rejected"] == 1


# --------------------------------------------------------------------------- #
# P2.4 depth proposals                                                         #
# --------------------------------------------------------------------------- #


def test_expansion_proposals_are_pending_and_labelled() -> None:
    q = _q("What is WACC?", qid="cq_w")
    ans = validate_answer(_src_answer(q.id, "WACC is the blended cost of capital for the firm."))
    props = propose_expansions([ans], [q])
    assert len(props) == 1
    p = props[0]
    assert p.status == "pending" and p.target_kind == "answer" and p.target_id == ans.id
    assert p.proposal_json["appendix_provenance"] == "synthesised_validated"
    assert p.proposal_json["value"].startswith(ans.expanded_explanation)


# --------------------------------------------------------------------------- #
# P2.7 firm signals                                                            #
# --------------------------------------------------------------------------- #


def _signal(text: str, employer: str = "JPM") -> ExtractedRecord:
    return ExtractedRecord(
        source_artefact_id="art_bank",
        exact_source_text=text,
        record_type=ExtractionClass.TOPIC_SIGNAL,
        extraction_method="test",
        extracted_metadata={
            "product_role": "firm_signal",
            "contract_provenance": "glassdoor_occurrence",
            "source_family": "glassdoor_question_bank",
            "employer": employer,
            "role": "Analyst",
        },
    )


def test_firm_signal_join_methods_topics_and_rows() -> None:
    q1 = _q("Walk me through a discounted cash flow valuation", qid="cq_dcf")
    q2 = _q("What is the difference between enterprise value and equity value", qid="cq_ev")
    variants = [
        QuestionVariant(canonical_question_id=q.id, source_wording=q.canonical_wording,
                        cleaned_wording=q.canonical_wording, normalised_hash=normalised_hash(q.canonical_wording))
        for q in (q1, q2)
    ]
    q1.normalised_hash, q2.normalised_hash = variants[0].normalised_hash, variants[1].normalised_hash
    signals = [
        _signal("Walk me through a discounted cash flow valuation"),
        _signal("walk me through a discounted cash flow valuation please", employer="GS"),
        _signal("Tell me about yourself"),
    ]
    rows: list[dict] = []
    occs, audits = join_firm_signals([q1, q2], variants, signals, join_rows=rows)
    methods = {o.join_method for o in occs}
    assert "exact" in methods
    assert all(o.canonical_question_id in {"cq_dcf", "cq_ev"} for o in occs)
    assert all(0 <= (o.join_score or 0) <= 1 for o in occs)
    assert {r["topic"] for r in rows} >= {"valuation", "behavioral"}
    summary = signal_join_summary(rows)
    assert summary["signal_occurrences"] == 3 and summary["join_coverage"] > 0
    assert audits[0]["payload"]["join_method"] in {"exact", "fuzzy", "embedding"}


def test_firm_signal_embedding_join_and_llm_tagger() -> None:
    q = _q("How does depreciation affect the three financial statements", qid="cq_dep")
    v = QuestionVariant(canonical_question_id=q.id, source_wording=q.canonical_wording,
                        cleaned_wording=q.canonical_wording, normalised_hash=normalised_hash(q.canonical_wording))
    q.normalised_hash = v.normalised_hash
    rows: list[dict] = []
    occs, _ = join_firm_signals(
        [q], [v], [_signal("depreciation affect three financial statements how does the")],
        fuzzy_threshold=101.0, join_rows=rows,
    )
    assert occs and occs[0].join_method == "embedding" and occs[0].join_score >= 0.82
    rows2: list[dict] = []
    tagger = llm_topic_tagger(lambda prompt: {"topics": ["markets"]})
    join_firm_signals([q], [v], [_signal("Something with no keywords at all")], join_rows=rows2,
                      topic_tagger=tagger)
    assert rows2[0]["topic"] == "markets" and rows2[0]["topic_method"] == "llm"


# --------------------------------------------------------------------------- #
# P2.11 behavioural seed                                                       #
# --------------------------------------------------------------------------- #


def test_behavioural_seed_loads_sixty_with_star_rubrics() -> None:
    result, items = load_behavioural_seed()
    assert len(items) == 60 and len(result.extracted) == 60
    meta = result.extracted[0].extracted_metadata
    assert meta["contract_provenance"] == "static_seed" and meta["not_glassdoor"] is True
    categories = {i.category for i in items}
    assert {"why_ib", "why_pe", "why_firm", "teamwork", "failure", "leadership", "deal", "ethics",
            "pressure", "self_awareness", "resume"} <= categories
    hash_to_cq = {normalised_hash(i.question): f"cq_{i.id}" for i in items}
    answers = [validate_answer(a) for a in behavioural_answers(items, hash_to_cq)]
    assert len(answers) == 60
    assert all(a.provenance_type == AnswerProvenance.SYNTHESISED_VALIDATED for a in answers)
    qs = [
        _q(i.question, qid=f"cq_{i.id}", topic="behavioral", subtopic=i.category, question_type="behavioral")
        for i in items
    ]
    out, stats = attach_rubrics(answers, qs)
    assert stats["star"] == 60 and stats["approved"] == 60
    by_type = {i.id: i.rubric_type for i in items}
    for a in out:
        first = a.rubric.key_points[0].text  # type: ignore[union-attr]
        if by_type[a.canonical_question_id[3:]] == "star":
            assert first.startswith("Situation")
        else:
            assert "reasons" in first


# --------------------------------------------------------------------------- #
# Stable ids + reports                                                         #
# --------------------------------------------------------------------------- #


def test_stable_ids_survive_prefix_strip_and_unsplit(tmp_path: Path) -> None:
    exports = tmp_path
    (exports / "questions.jsonl").write_text(
        json.dumps({"id": "cq_old1", "canonical_wording": "Question 7: What is WACC?"}) + "\n"
        + json.dumps({"id": "cq_old2", "canonical_wording": "Question 20: Would a seller prefer a stock "
                      "purchase or an asset purchase?"}) + "\n",
        encoding="utf-8",
    )
    (exports / "answers.jsonl").write_text(
        json.dumps({"id": "ans_old1", "canonical_question_id": "cq_old1"}) + "\n", encoding="utf-8"
    )
    prior = load_prior_ids(exports)
    assert prior.answer_ids == {"cq_old1": "ans_old1"}
    q1 = _q("What is WACC?", qid="cq_new1", normalised_hash=normalised_hash("What is WACC?"))
    compound = "Would a seller prefer a stock purchase or an asset purchase? What about the buyer?"
    q2 = _q(compound, qid="cq_new2", normalised_hash=normalised_hash(compound))
    v = QuestionVariant(canonical_question_id="cq_new2", source_wording=compound,
                        cleaned_wording=compound, normalised_hash=q2.normalised_hash)
    remap = assign_stable_ids([q1, q2], [v], prior)
    assert q1.id == "cq_old1" and q2.id == "cq_old2" and v.canonical_question_id == "cq_old2"
    assert remap == {"cq_new1": "cq_old1", "cq_new2": "cq_old2"}
    assert assign_stable_ids([_q("x")], [], PriorIds()) == {}


def test_completeness_metrics_and_license(tmp_path: Path) -> None:
    qs = [
        {"id": "a", "canonical_wording": "What is WACC?", "topic": "valuation", "domain": "ib"},
        {"id": "b", "canonical_wording": "Question 2: Why?", "topic": None, "domain": "other"},
    ]
    ans = [
        {"canonical_question_id": "a", "concise_answer": "x", "expanded_explanation": "x y",
         "provenance_type": "source_provided", "validation_status": "pass",
         "rubric": {"review_status": "approved", "kind": "technical", "provenance": "heuristic"}},
        {"canonical_question_id": "b", "concise_answer": "Structure a clear interview answer to: Why?",
         "expanded_explanation": "…", "provenance_type": "needs_review",
         "validation_status": "needs_generation"},
    ]
    m = compute_metrics(qs, ans)
    assert m["c1"] == 0.5 and m["c2"] == 0.5 and m["c11"] == 1.0
    assert m["placeholders"] == 1 and m["prefix_wordings"] == 1
    out = tmp_path / "license-review.md"
    write_license_review(out, ROOT / "config" / "github_sources.yml")
    text = out.read_text(encoding="utf-8")
    assert "Owner attestation" in text and "2026-09-23" in text
    assert "permission granted by owner" in text
