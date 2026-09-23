"""Offline LLM enrichment job (OpenRouter) — wires Mode A/B graph slices.

Must not run on the question-browse request path. Invoke from workers:

    python -m ibpe_corpus.answers.enrich_job --limit 50            # small tier
    python -m ibpe_corpus.answers.enrich_job --tier primary        # Jev tier
    # or apps/worker entry (see apps/worker/README.md)

"Only when required": each question first gets the heuristic proposal; the
model is called only when that proposal is below the auto-approve bar or fails
validation, the small tier first, escalating to primary only when the small
model's draft fails validation. Route counts (heuristic / small / primary /
failed) land in the report JSON and CLI output.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

from ibpe_corpus.answers.enrich_models import (
    CompanyPrepNode,
    ConceptLabNode,
    EnrichmentGraphSlice,
    EnrichmentProposal,
)
from ibpe_corpus.answers.editorial import EditorialReviewQueue
from ibpe_corpus.answers.proposals import ProposalStore, proposal_id
from ibpe_corpus.answers.llm_client import (
    ENRICH_PROMPT_VERSION,
    EnrichClient,
    LlmRouteCounts,
    Tier,
    credentials_configured,
    heuristic_proposal,
    run_tiered,
    validate_enrich_draft,
)
from ibpe_corpus.answers.enrich_models import EnrichDraft
from ibpe_corpus.canonical.taxonomy_rules import AUTO_APPROVE_CONFIDENCE
from ibpe_corpus.answers.provenance import (
    EnrichmentProvenance,
    assert_not_source_laundering,
    collect_provenance_violations,
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
            review_note="enrich-v1 graph metadata (concepts, routing, diagrams) — editorial review",
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


def _llm_propose(client: object, cq: CanonicalQuestion) -> tuple[EnrichmentProposal | None, str]:
    """Small tier first; primary only when the small draft fails validation."""
    if getattr(client, "supports_tiers", False):
        return client.propose_routed(cq)  # type: ignore[attr-defined]
    return run_tiered([(Tier.SMALL, lambda: client.propose(cq))])  # type: ignore[attr-defined]


def run_enrich_batch(
    questions: Sequence[CanonicalQuestion],
    *,
    client: EnrichClient | None = None,
    existing_answers: Sequence[Answer] = (),
    limit: int | None = None,
    enqueue_low_confidence: bool = True,
    review_queue: EditorialReviewQueue | None = None,
    proposal_store: ProposalStore | None = None,
) -> tuple[EnrichmentGraphSlice, EditorialReviewQueue, dict]:
    """Batch-enrich canonical questions offline.

    Corpus answers are not overwritten; enrichment is additive graph metadata.
    Low-confidence proposals can enter the editorial review queue. With a
    ``proposal_store`` every proposal is persisted (plan P2.1) instead of
    living only in memory.
    """
    client = client or EnrichClient()
    queue = review_queue or EditorialReviewQueue()
    answered_ids = {
        a.canonical_question_id
        for a in existing_answers
        if a.concise_answer and a.provenance_type.value != "rejected"
    }

    selected = list(questions)
    if limit is not None:
        selected = selected[: max(0, limit)]

    proposals: list[EnrichmentProposal] = []
    routes = LlmRouteCounts()
    live = not getattr(client, "dry_run", True)
    for cq in selected:
        heuristic = heuristic_proposal(cq, model=client.model)
        if not live or heuristic_sufficient(heuristic):
            prop = heuristic
            routes.record("heuristic")
        else:
            llm_prop, route = _llm_propose(client, cq)
            routes.record(route)
            prop = llm_prop or heuristic.model_copy(
                update={"metadata": {**heuristic.metadata, "llm_failed": True}}
            )
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
        "dry_run": bool(client.dry_run),
        "credentials_configured": credentials_configured(),
        "model": client.model,
        "tier": getattr(getattr(client, "default_tier", None), "value", "small"),
        "llm_heuristic": routes.heuristic,
        "llm_small": routes.small,
        "llm_primary": routes.primary,
        "llm_failed": routes.failed,
        "llm_routes": routes.as_dict(),
        "models_used": sorted(
            {p.model_version for p in proposals if not (p.metadata or {}).get("dry_run")}
        ),
        "llm_usage": dict(getattr(client, "usage", {}) or {}),
        "prompt_version": ENRICH_PROMPT_VERSION,
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
    parser = argparse.ArgumentParser(description="Offline LLM enrichment job (OpenRouter)")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--dry-run", action="store_true", help="Force heuristic mode")
    parser.add_argument(
        "--tier",
        choices=[t.value for t in Tier],
        default=None,
        help="LLM tier: small (LLM_SMALL_MODEL, default) or primary (LLM_PRIMARY_MODEL / Jev)",
    )
    parser.add_argument(
        "--no-escalate",
        action="store_true",
        help="Do not retry small-model drafts that fail validation on the primary tier",
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

    client = EnrichClient(
        dry_run=args.dry_run or not credentials_configured(),
        default_tier=args.tier,
        escalate=not args.no_escalate,
    )
    graph, queue, metrics = run_enrich_batch(
        questions, client=client, limit=args.limit, review_queue=queue, proposal_store=store
    )
    write_enrichment_report(graph, metrics, path=args.report, queue=queue)
    print(json.dumps({"ok": True, "report": str(args.report), "metrics": metrics}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
