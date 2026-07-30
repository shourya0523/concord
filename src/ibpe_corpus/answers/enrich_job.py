"""Offline Gemini enrichment job — wires Mode A/B graph slices.

Must not run on the question-browse request path. Invoke from workers:

    python -m ibpe_corpus.answers.enrich_job --limit 50
    # or apps/worker entry (see apps/worker/README.md)
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
from ibpe_corpus.answers.gemini_client import (
    ENRICH_PROMPT_VERSION,
    GeminiEnrichClient,
    credentials_configured,
)
from ibpe_corpus.answers.provenance import (
    EnrichmentProvenance,
    assert_not_source_laundering,
    collect_provenance_violations,
)
from ibpe_corpus.schemas.models import Answer, CanonicalQuestion, JobResult, JobState, utcnow


JOB_NAME = "gemini_enrich"
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
                        provenance=EnrichmentProvenance.GEMINI_SYNTHESISED,
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
                        provenance=EnrichmentProvenance.GEMINI_SYNTHESISED,
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
                        provenance=EnrichmentProvenance.GEMINI_SYNTHESISED,
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
                        provenance=EnrichmentProvenance.GEMINI_SYNTHESISED,
                    )
                )

    return EnrichmentGraphSlice(
        company_prep=company_prep,
        concept_lab=concept_lab,
        proposals=list(proposals),
    )


def run_enrich_batch(
    questions: Sequence[CanonicalQuestion],
    *,
    client: GeminiEnrichClient | None = None,
    existing_answers: Sequence[Answer] = (),
    limit: int | None = None,
    enqueue_low_confidence: bool = True,
    review_queue: EditorialReviewQueue | None = None,
) -> tuple[EnrichmentGraphSlice, EditorialReviewQueue, dict]:
    """Batch-enrich canonical questions offline.

    Corpus answers are not overwritten; enrichment is additive graph metadata.
    Low-confidence proposals can enter the editorial review queue.
    """
    client = client or GeminiEnrichClient()
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
    for cq in selected:
        prop = client.propose(cq)
        assert_not_source_laundering(
            provenance=prop.provenance.value,
            model_version=prop.model_version,
        )
        proposals.append(prop)
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
        "prompt_version": ENRICH_PROMPT_VERSION,
        "answer_provenance_violations": len(violations),
        "answered_canonical_ids": len(answered_ids),
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
            "Gemini enrichment is always gemini_synthesised; "
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
        message="gemini enrich batch complete" if ok else "gemini enrich failed",
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
    parser = argparse.ArgumentParser(description="Offline Gemini enrichment job")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--dry-run", action="store_true", help="Force heuristic mode")
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
    args = parser.parse_args(argv)

    if args.questions_json and args.questions_json.exists():
        raw = json.loads(args.questions_json.read_text(encoding="utf-8"))
        questions = [CanonicalQuestion.model_validate(row) for row in raw]
    else:
        questions = _demo_questions()

    client = GeminiEnrichClient(dry_run=args.dry_run or not credentials_configured())
    graph, queue, metrics = run_enrich_batch(
        questions, client=client, limit=args.limit
    )
    write_enrichment_report(graph, metrics, path=args.report, queue=queue)
    print(json.dumps({"ok": True, "report": str(args.report), "metrics": metrics}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
