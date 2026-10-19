"""Offline enrichment job (``llm_enrich``) — wires Mode A/B graph slices.

Must not run on the question-browse request path. Invoke from workers:

    python -m ibpe_corpus.answers.enrich_job --limit 50          # Jev classification
    python -m ibpe_corpus.answers.enrich_job --limit 50 --llm    # + small-model diagram drafts
    # or apps/worker entry (see apps/worker/README.md)

Classification fields come from **Jev** (``typesafe/jev-1.13``, Decisions API),
never from a chat model: ONE request per question asks ``choice`` concept (the
migration 060 curriculum concept ids), ``choice`` learning mode
(company_prep / concept_learn / both), ``choice`` track, ``score`` difficulty and
— when the question has no topic — ``choice`` topic over the 038 slugs.

Free-text drafts (diagrams) stay heuristic-only unless ``--llm``: then the small
model (``LLM_SMALL_MODEL``) drafts a Mermaid diagram for questions with a source
teaching answer, Jev verifies it against that answer (``supported`` at
≥ ``JEV_ACCEPT_CONFIDENCE``), and ``--escalate`` (default) retries a rejected
draft once. Route counts (heuristic / jev / small / failed) land in the report
JSON and CLI output. Every proposal is a ``pending`` graph record — never
auto-applied.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Sequence

from ibpe_corpus.answers.decisions_client import DecisionsClient, DecisionResponse, jev_auto_approve
from ibpe_corpus.answers.enrich_models import (
    CompanyPrepNode,
    ConceptHint,
    ConceptLabNode,
    DiagramDraft,
    DiagramDraftOut,
    EnrichmentGraphSlice,
    EnrichmentProposal,
    LearningMode,
    ModeRouting,
)
from ibpe_corpus.answers.editorial import EditorialReviewQueue
from ibpe_corpus.answers.jev_questions import (
    CONCEPT_CATALOG,
    DIAGRAM_VERIFY,
    DIFFICULTY_LEVELS,
    NO_CONCEPT,
    graph_questions,
    question_state,
)
from ibpe_corpus.answers.proposals import ProposalStore, proposal_id
from ibpe_corpus.answers.llm_client import (
    ENRICH_PROMPT_VERSION,
    LLM_ENRICH_SOURCE_ID,
    LlmError,
    LlmRouteCounts,
    LlmValidationError,
    OpenRouterClient,
    credentials_configured,
    heuristic_proposal,
    run_verified,
    validate_enrich_draft,
)
from ibpe_corpus.answers.enrich_models import EnrichDraft
from ibpe_corpus.canonical.taxonomy_rules import AUTO_APPROVE_CONFIDENCE
from ibpe_corpus.answers.provenance import (
    EnrichmentProvenance,
    assert_not_source_laundering,
    collect_provenance_violations,
    label_enrichment_record,
)
from ibpe_corpus.schemas.models import (
    Answer,
    CanonicalQuestion,
    EnrichmentProposalRecord,
    JobResult,
    JobState,
    utcnow,
)


JOB_NAME = "llm_enrich"
DEFAULT_REPORT = Path("reports/answer-enrichment-report.json")
GRAPH_JEV_PROMPT_VERSION = "enrich-jev-v1"
DIAGRAM_PROMPT_VERSION = "diagram-v1"
_TRACK = {"ib": "IB", "pe": "PE", "both": "Both"}


def build_graph_slice(proposals: Sequence[EnrichmentProposal]) -> EnrichmentGraphSlice:
    """Map enrichment proposals into company-prep + concept-lab nodes."""
    company_prep: list[CompanyPrepNode] = []
    concept_lab: list[ConceptLabNode] = []

    for prop in proposals:
        assert_not_source_laundering(
            provenance=prop.provenance.value,
            model_version=prop.model_version,
        )
        if prop.provenance.value in {"glassdoor", "github_source", "source_provided"}:
            raise AssertionError("enrichment provenance laundering blocked")

        if prop.mode_routing.for_company_prep():
            topic_id = (prop.topic or "general").lower().replace(" ", "_")
            tags = prop.firm_soft_tags or []
            if not tags:
                # Soft placeholder firm bucket for concept-led items still useful in Mode A.
                company_prep.append(
                    CompanyPrepNode(
                        firm_id="unscoped",
                        topic_id=topic_id,
                        canonical_question_id=prop.canonical_question_id,
                        enrichment_id=prop.id,
                        soft_relevance=prop.mode_routing.company_prep_weight,
                        provenance=EnrichmentProvenance.LLM_SYNTHESISED,
                    )
                )
            for tag in tags:
                company_prep.append(
                    CompanyPrepNode(
                        firm_id=tag.firm_id,
                        topic_id=topic_id,
                        canonical_question_id=prop.canonical_question_id,
                        enrichment_id=prop.id,
                        soft_relevance=tag.relevance,
                        provenance=EnrichmentProvenance.LLM_SYNTHESISED,
                    )
                )

        if prop.mode_routing.for_concept_lab():
            concepts = prop.concepts or []
            if not concepts:
                concept_lab.append(
                    ConceptLabNode(
                        concept_slug=(prop.topic or "general").lower().replace(" ", "-"),
                        canonical_question_id=prop.canonical_question_id,
                        enrichment_id=prop.id,
                        prerequisites=[],
                        diagram_ids=[d.id for d in prop.diagram_drafts],
                        resource_ids=[r.id for r in prop.resource_drafts],
                        provenance=EnrichmentProvenance.LLM_SYNTHESISED,
                    )
                )
            for concept in concepts:
                concept_lab.append(
                    ConceptLabNode(
                        concept_slug=concept.slug,
                        canonical_question_id=prop.canonical_question_id,
                        enrichment_id=prop.id,
                        prerequisites=list(concept.prerequisites),
                        diagram_ids=[d.id for d in prop.diagram_drafts],
                        resource_ids=[r.id for r in prop.resource_drafts],
                        provenance=EnrichmentProvenance.LLM_SYNTHESISED,
                    )
                )

    return EnrichmentGraphSlice(
        company_prep=company_prep,
        concept_lab=concept_lab,
        proposals=list(proposals),
    )


def graph_proposal_records(prop: EnrichmentProposal) -> list[EnrichmentProposalRecord]:
    """Durable ``staging.enrichment_proposals`` rows for one enrich-v1 proposal.

    Graph metadata (concepts, mode routing, diagrams, firm soft-tags) is stored
    as a single ``enrichment`` field row; it is never auto-applied.
    """
    payload = prop.model_dump(mode="json")
    pid = proposal_id("question", prop.canonical_question_id, "enrichment", prop.prompt_version)
    return [
        EnrichmentProposalRecord(
            id=pid,
            target_kind="question",
            target_id=prop.canonical_question_id,
            field="enrichment",
            proposal_json={"value": payload, "dry_run": bool((prop.metadata or {}).get("dry_run"))},
            model=prop.model_version,
            prompt_version=prop.prompt_version,
            confidence=prop.confidence,
            status="pending",
            review_note="graph metadata (concepts, routing, diagrams) — editorial review",
        )
    ]


def heuristic_sufficient(prop: EnrichmentProposal) -> bool:
    """The heuristic proposal is good enough to skip the model entirely.

    Requires confidence at the taxonomy auto-approve bar *and* a draft that
    passes the same validators a model reply must pass.
    """
    if prop.confidence < AUTO_APPROVE_CONFIDENCE:
        return False
    draft = EnrichDraft.model_validate(
        prop.model_dump(mode="json", include=set(EnrichDraft.model_fields))
    )
    return not validate_enrich_draft(draft)


def _mode_routing(resp: DecisionResponse) -> ModeRouting:
    ans = resp.choice("mode")
    p = ans.probabilities or {}
    both = float(p.get("both", 0.0))
    return ModeRouting(
        modes=[LearningMode(ans.choice)],
        company_prep_weight=round(min(1.0, float(p.get("company_prep", 0.0)) + both), 4),
        concept_learn_weight=round(min(1.0, float(p.get("concept_learn", 0.0)) + both), 4),
    )


def jev_graph_proposal(
    cq: CanonicalQuestion,
    heuristic: EnrichmentProposal,
    resp: DecisionResponse,
    *,
    model: str,
) -> EnrichmentProposal:
    """Graph proposal from one Jev response (classification fields only)."""
    confidences: list[float] = []
    update: dict[str, Any] = {}
    bar = jev_auto_approve()
    if "topic" in resp.answers:
        ans = resp.choice("topic")
        confidences.append(ans.conf)
        if ans.conf >= bar:
            update["topic"] = ans.choice
    if "domain" in resp.answers:
        ans = resp.choice("domain")
        confidences.append(ans.conf)
        track = _TRACK.get(ans.choice)
        if track:
            update["track"] = track
            update["pe_relevance"] = "core" if ans.choice in {"pe", "both"} else None
            update["ib_relevance"] = "core" if ans.choice in {"ib", "both"} else None
    if "difficulty" in resp.answers:
        ans = resp.score("difficulty")
        confidences.append(ans.conf)
        update["difficulty"] = DIFFICULTY_LEVELS[ans.index(len(DIFFICULTY_LEVELS))]
    if "concept" in resp.answers:
        ans = resp.choice("concept")
        confidences.append(ans.conf)
        if ans.choice != NO_CONCEPT and ans.choice in CONCEPT_CATALOG:
            slug, _summary, prereqs = CONCEPT_CATALOG[ans.choice]
            update["concepts"] = [
                ConceptHint(
                    slug=slug,
                    title=slug.replace("-", " ").title(),
                    prerequisites=[CONCEPT_CATALOG[p][0] for p in prereqs if p in CONCEPT_CATALOG],
                )
            ]
    if "mode" in resp.answers:
        confidences.append(resp.choice("mode").conf)
        update["mode_routing"] = _mode_routing(resp)
    stamped = label_enrichment_record({}, model_version=model, prompt_version=GRAPH_JEV_PROMPT_VERSION)
    update.update(
        confidence=round(min(confidences), 4) if confidences else heuristic.confidence,
        model_version=model,
        prompt_version=GRAPH_JEV_PROMPT_VERSION,
        metadata={
            "source_id": LLM_ENRICH_SOURCE_ID,
            "dry_run": False,
            "gateway": "openrouter",
            "decision_model": model,
            "jev": {k: a.model_dump(mode="json", exclude={"type", "legend"}, exclude_none=True)
                    for k, a in resp.answers.items()},
            "diagram_source": "heuristic",
            "provenance_label": stamped["provenance"],
        },
    )
    return heuristic.model_copy(update=update)


DIAGRAM_PROMPT = """Draft ONE Mermaid flowchart that teaches the concept behind this IB/PE
interview question. Use ONLY steps and relationships stated in the TEACHING ANSWER;
never mention Glassdoor. Return JSON {{"type": str, "format": "mermaid", "spec": str,
"a11y_fallback": str}} where spec starts with "flowchart".

QUESTION: {question}
TEACHING ANSWER: {answer}
"""


def _diagram_step(call: Any, cq: CanonicalQuestion, source: str):
    from ibpe_corpus.answers.llm_client import _MERMAID_RE  # type: ignore[attr-defined]

    tries = {"n": 0}

    def run() -> tuple[DiagramDraftOut, str | None]:
        prompt = DIAGRAM_PROMPT.format(question=cq.canonical_wording, answer=source)
        if tries["n"]:
            prompt += "\nA verifier rejected the previous diagram; depict only what the answer states."
        tries["n"] += 1
        try:
            draft = DiagramDraftOut.model_validate(call(prompt))
        except ValueError as exc:
            raise LlmValidationError("diagram-v1 reply unusable", errors=[str(exc)[:120]]) from None
        errors = []
        if not _MERMAID_RE.match(draft.spec or ""):
            errors.append("diagram_not_mermaid")
        if "glassdoor" in (draft.spec + (draft.a11y_fallback or "")).lower():
            errors.append("glassdoor_attribution")
        if errors:
            raise LlmValidationError("diagram-v1 draft failed validation", errors=errors)
        return draft, getattr(call, "last_model", None) or getattr(call, "model", None)

    return run


def llm_diagram(
    prop: EnrichmentProposal,
    cq: CanonicalQuestion,
    source: str,
    *,
    call: Any,
    decider: Any,
    attempts: int,
    routes: LlmRouteCounts,
) -> EnrichmentProposal:
    """Small-model diagram draft, Jev-verified; the heuristic diagram is kept otherwise."""

    def verify(value: tuple[DiagramDraftOut, str | None]) -> Any:
        return decider.verify(
            source=source,
            question=cq.canonical_wording,
            draft=value[0].spec,
            instructions=DIAGRAM_VERIFY["instructions"],
            criteria=DIAGRAM_VERIFY["criteria"],
        )

    value, route, verdicts = run_verified(_diagram_step(call, cq, source), verify,
                                          attempts=attempts, counts=routes)
    routes.record(route)
    if value is None:
        return prop
    draft, served = value
    diagram = DiagramDraft(type=draft.type or "generic", format="mermaid", spec=draft.spec,
                           a11y_fallback=draft.a11y_fallback)
    meta = {**prop.metadata, "diagram_source": "small+jev", "diagram_model": served,
            "diagram_prompt_version": DIAGRAM_PROMPT_VERSION,
            "diagram_verdict": verdicts[-1].as_dict()}
    return prop.model_copy(update={"diagram_drafts": [diagram], "metadata": meta})


def run_enrich_batch(
    questions: Sequence[CanonicalQuestion],
    *,
    decider: DecisionsClient | None = None,
    small: OpenRouterClient | None = None,
    existing_answers: Sequence[Answer] = (),
    limit: int | None = None,
    enqueue_low_confidence: bool = True,
    review_queue: EditorialReviewQueue | None = None,
    proposal_store: ProposalStore | None = None,
) -> tuple[EnrichmentGraphSlice, EditorialReviewQueue, dict]:
    """Batch-enrich canonical questions offline.

    Corpus answers are not overwritten; enrichment is additive graph metadata.
    ``decider`` (Jev) classifies; ``small`` (optional, ``--llm``) drafts
    diagrams that Jev must verify. Low-confidence proposals can enter the
    editorial review queue. With a ``proposal_store`` every proposal is
    persisted (plan P2.1) instead of living only in memory.
    """
    decider = decider or DecisionsClient()
    queue = review_queue or EditorialReviewQueue()
    answered_ids = {
        a.canonical_question_id
        for a in existing_answers
        if a.concise_answer and a.provenance_type.value != "rejected"
    }
    source_text = {
        a.canonical_question_id: f"{a.concise_answer} {a.expanded_explanation}".strip()
        for a in existing_answers
        if a.concise_answer
        and a.provenance_type.value in {"source_provided", "corpus_matched"}
    }

    selected = list(questions)
    if limit is not None:
        selected = selected[: max(0, limit)]

    proposals: list[EnrichmentProposal] = []
    routes = LlmRouteCounts()
    diagram_routes = LlmRouteCounts()
    live = not getattr(decider, "dry_run", True)
    small_live = small is not None and not getattr(small, "dry_run", True) and live
    diagram_call = small.json_caller(DiagramDraftOut) if small_live else None
    for cq in selected:
        heuristic = heuristic_proposal(cq)
        prop = heuristic
        if not live or heuristic_sufficient(heuristic):
            routes.record("heuristic")
        else:
            try:
                resp = decider.decide(
                    question_state(cq.canonical_wording, topic=cq.topic, subtopic=cq.subtopic),
                    graph_questions(include_topic=not cq.topic),
                )
            except LlmError:
                routes.record("failed")
                prop = heuristic.model_copy(
                    update={"metadata": {**heuristic.metadata, "llm_failed": True}}
                )
            else:
                routes.record("jev")
                prop = jev_graph_proposal(cq, heuristic, resp, model=resp.model or decider.model)
        if diagram_call is not None and cq.id in source_text:
            prop = llm_diagram(prop, cq, source_text[cq.id], call=diagram_call, decider=decider,
                               attempts=small.draft_attempts, routes=diagram_routes)
        assert_not_source_laundering(
            provenance=prop.provenance.value,
            model_version=prop.model_version,
        )
        proposals.append(prop)
        if proposal_store is not None:
            proposal_store.upsert_many(graph_proposal_records(prop))
        if enqueue_low_confidence and prop.confidence < 0.5:
            queue.enqueue(
                canonical_question_id=cq.id,
                enrichment_id=prop.id,
                reason="low_enrichment_confidence",
                priority=1 if cq.id not in answered_ids else 0,
                metadata={"confidence": prop.confidence},
            )

    graph = build_graph_slice(proposals)
    violations = collect_provenance_violations(existing_answers)
    metrics = {
        "input_questions": len(selected),
        "proposals": len(proposals),
        "company_prep_nodes": len(graph.company_prep),
        "concept_lab_nodes": len(graph.concept_lab),
        "review_queued": len(queue.list_pending()),
        "dry_run": not live,
        "credentials_configured": credentials_configured(),
        "model": decider.model,
        "small_model": small.small_model if small is not None else None,
        "llm_heuristic": routes.heuristic,
        "llm_jev": routes.jev,
        "llm_small": diagram_routes.small,
        "llm_failed": routes.failed,
        "llm_routes": routes.as_dict(),
        "diagram_routes": diagram_routes.as_dict(),
        "jev_rejected_drafts": diagram_routes.jev_rejected,
        "models_used": sorted(
            {p.model_version for p in proposals if not (p.metadata or {}).get("dry_run")}
            | {str(p.metadata["diagram_model"]) for p in proposals
               if (p.metadata or {}).get("diagram_model")}
        ),
        "llm_usage": {
            "jev": dict(getattr(decider, "usage", {}) or {}),
            "small": dict(getattr(small, "usage", {}) or {}) if small is not None else None,
        },
        "prompt_version": GRAPH_JEV_PROMPT_VERSION if live else ENRICH_PROMPT_VERSION,
        "answer_provenance_violations": len(violations),
        "answered_canonical_ids": len(answered_ids),
        "persisted_proposals": len(proposals) if proposal_store is not None else 0,
    }
    return graph, queue, metrics


def write_enrichment_report(
    graph: EnrichmentGraphSlice,
    metrics: dict,
    *,
    path: Path = DEFAULT_REPORT,
    queue: EditorialReviewQueue | None = None,
) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "job": JOB_NAME,
        "generated_at": utcnow().isoformat(),
        "metrics": metrics,
        "provenance_rule": (
            "LLM enrichment is always labelled gemini_synthesised (LLM-synthesised; "
            "actual OpenRouter model id in model_version); "
            "never attributed to Glassdoor or to a GitHub path that lacked the text."
        ),
        "company_prep_sample": [
            n.model_dump(mode="json") for n in graph.company_prep[:20]
        ],
        "concept_lab_sample": [
            n.model_dump(mode="json") for n in graph.concept_lab[:20]
        ],
        "proposals_sample": [
            p.model_dump(mode="json") for p in graph.proposals[:10]
        ],
        "editorial_queue_pending": (queue.list_pending() if queue else []),
    }
    if queue is not None:
        payload["editorial_queue_pending"] = [
            i.model_dump(mode="json") for i in queue.list_pending()
        ]
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def job_result_from_metrics(
    metrics: dict,
    *,
    idempotency_key: str,
    ok: bool = True,
) -> JobResult:
    return JobResult(
        job_name=JOB_NAME,
        idempotency_key=idempotency_key,
        state=JobState.COMPLETED if ok else JobState.FAILED,
        started_at=utcnow(),
        completed_at=utcnow(),
        input_count=int(metrics.get("input_questions") or 0),
        output_count=int(metrics.get("proposals") or 0),
        parser_or_model_version=str(metrics.get("model") or ""),
        metrics={k: v for k, v in metrics.items() if isinstance(v, (int, float))},
        message="llm enrich batch complete" if ok else "llm enrich failed",
    )


def _demo_questions() -> list[CanonicalQuestion]:
    from ibpe_corpus.schemas.models import Domain

    return [
        CanonicalQuestion(
            id="cq_enrich_wacc",
            canonical_wording="What is WACC and how do you calculate it?",
            topic="wacc",
            domain=Domain.IB,
        ),
        CanonicalQuestion(
            id="cq_enrich_lbo",
            canonical_wording="Walk me through a paper LBO.",
            topic="paper_lbo",
            domain=Domain.PE,
        ),
        CanonicalQuestion(
            id="cq_enrich_dcf",
            canonical_wording="Walk me through a DCF.",
            topic="dcf",
            domain=Domain.IB,
        ),
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Offline enrichment job: Jev (LLM_DECISION_MODEL) classifies concept / mode / "
            "track / difficulty / topic; the small chat model drafts diagrams only with --llm, "
            "always Jev-verified."
        )
    )
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--dry-run", action="store_true", help="Force heuristic mode (no network)")
    parser.add_argument(
        "--llm",
        action="store_true",
        help="Also draft Mermaid diagrams with the small model (LLM_SMALL_MODEL); each draft is "
        "Jev-verified against the source answer and kept only when 'supported'",
    )
    parser.add_argument(
        "--no-escalate",
        action="store_true",
        help="Do not retry (once, with the small model) a diagram draft Jev rejected",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_REPORT,
        help="Write JSON report path",
    )
    parser.add_argument(
        "--questions-json",
        type=Path,
        default=None,
        help="Optional JSON list of {id,canonical_wording,topic,...}",
    )
    parser.add_argument(
        "--questions-jsonl",
        type=Path,
        default=None,
        help="Exported teaching questions (e.g. exports/questions.jsonl)",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=None,
        help="Persist proposals + review queue in this SQLite corpus DB (durable)",
    )
    args = parser.parse_args(argv)

    if args.questions_jsonl and args.questions_jsonl.exists():
        questions = [
            CanonicalQuestion.model_validate_json(line)
            for line in args.questions_jsonl.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    elif args.questions_json and args.questions_json.exists():
        raw = json.loads(args.questions_json.read_text(encoding="utf-8"))
        questions = [CanonicalQuestion.model_validate(row) for row in raw]
    else:
        questions = _demo_questions()

    store = None
    queue = None
    if args.db is not None:
        from ibpe_corpus.storage.db import CorpusStore

        corpus = CorpusStore(args.db)
        store = ProposalStore(corpus)
        queue = EditorialReviewQueue(corpus)

    dry = args.dry_run or not credentials_configured()
    decider = DecisionsClient(dry_run=dry)
    small = OpenRouterClient(dry_run=dry, escalate=not args.no_escalate) if args.llm else None
    answers: list[Answer] = []
    answers_path = (args.questions_jsonl.parent / "answers.jsonl") if args.questions_jsonl else None
    if args.llm and answers_path is not None and answers_path.exists():
        # Source teaching answers are what Jev verifies diagram drafts against.
        for line in answers_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                answers.append(Answer.model_validate_json(line))
            except ValueError:
                continue
    try:
        graph, queue, metrics = run_enrich_batch(
            questions, decider=decider, small=small, existing_answers=answers,
            limit=args.limit, review_queue=queue, proposal_store=store,
        )
    finally:
        decider.close()
        if small is not None:
            small.close()
    write_enrichment_report(graph, metrics, path=args.report, queue=queue)
    print(json.dumps({"ok": True, "report": str(args.report), "metrics": metrics}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
