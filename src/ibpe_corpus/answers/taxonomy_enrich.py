"""Taxonomy enrichment (plan P2.2): topic / domain / difficulty for teaching Qs.

Two proposers, one policy:

* **Heuristic** (no key): :func:`classify_taxonomy` combines the source's own
  category / track / difficulty labels, keyword rules (migration 038 + v4) on
  the wording, and rules on the *source-provided* answer.
* **LLM** (``enrich-v1`` via :class:`~ibpe_corpus.answers.llm_client.EnrichClient`
  on OpenRouter) when ``OPENROUTER_API_KEY`` is set and the client is not in
  dry-run mode — **only when required**: the heuristic runs first and the model
  is called only for questions whose topic / domain proposals the heuristic
  could not auto-approve (difficulty-only gaps are skipped: an LLM difficulty
  guess is never auto-approvable). Small tier first; primary only when the
  small model's proposal fails validation (unknown topic slug / bad schema).

Auto-approval: a topic proposal is approved only when the proposer's topic
equals the keyword-rule topic **and** confidence ≥ 0.8. Domain is approved when
it is source-declared, or derived from an approved topic; ib-vs-pe conflicts
between a source track and a topic resolve to ``both``. Difficulty is approved
only when it comes from the source's own label (or ``adv-*`` category names);
wording-cue guesses stay pending. A deterministic ~10% of auto-approvals is
flagged ``review_sample`` and queued for human spot-checks. Everything else is
a ``pending`` proposal in the editorial queue — never applied.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from ibpe_corpus.answers.editorial import EditorialReviewQueue
from ibpe_corpus.answers.proposals import AUTO_REVIEWER_PREFIX, ProposalStore, proposal_id
from ibpe_corpus.canonical.taxonomy_rules import (
    AUTO_APPROVE_CONFIDENCE,
    RULES_VERSION,
    TOPIC_SLUGS,
    UNTAGGED,
    TaxonomyGuess,
    classify_taxonomy,
    domain_for_topic,
    infer_topic,
)
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    CanonicalQuestion,
    Domain,
    EnrichmentProposalRecord,
    utcnow,
)

HEURISTIC_PROMPT_VERSION = f"taxonomy-{RULES_VERSION}"
HEURISTIC_MODEL = "heuristic-taxonomy-v2"
REVIEW_SAMPLE_RATE = 10  # 1 in N auto-approvals is sampled for human review

_TOPIC_ALIASES: dict[str, str] = {
    "dcf": "valuation",
    "wacc": "valuation",
    "comps": "valuation",
    "valuation": "valuation",
    "three_statements": "accounting",
    "3_statements": "accounting",
    "accounting": "accounting",
    "ev_bridge": "enterprise_value",
    "enterprise_value": "enterprise_value",
    "m&a": "merger_models",
    "merger": "merger_models",
    "mergers": "merger_models",
    "accretion_dilution": "merger_models",
    "merger_models": "merger_models",
    "leveraged_buyout": "lbo",
    "paper_lbo": "lbo",
    "lbo": "lbo",
    "moic_irr": "returns",
    "returns": "returns",
    "behavioural": "behavioral",
    "behavioral": "behavioral",
    "fit": "behavioral",
    "brainteaser": "brainteasers",
    "debt": "credit",
    "leveraged_finance": "credit",
}


@dataclass
class SourceHints:
    """Source-declared labels for one teaching question."""

    category: str | None = None
    track: str | None = None
    domain: str | None = None
    difficulty: str | None = None
    answer_text: str | None = None  # source-provided answer only


def normalise_topic(raw: str | None) -> str | None:
    if not raw:
        return None
    key = re.sub(r"[\s/\-]+", "_", str(raw).strip().lower())
    key = _TOPIC_ALIASES.get(key, key)
    return key if key in TOPIC_SLUGS else None


def _is_sampled(pid: str) -> bool:
    return int(hashlib.sha1(pid.encode()).hexdigest()[:8], 16) % REVIEW_SAMPLE_RATE == 0


def _missing_topic(q: CanonicalQuestion) -> bool:
    return not q.topic or q.topic == UNTAGGED


def _missing_domain(q: CanonicalQuestion) -> bool:
    return q.domain in {None, Domain.OTHER}


def hints_from_answers(answers: Iterable[Answer]) -> dict[str, str]:
    """Source-provided answer text per question (synthesised text excluded)."""
    out: dict[str, str] = {}
    for a in answers:
        if a.provenance_type in {AnswerProvenance.SOURCE_PROVIDED, AnswerProvenance.CORPUS_MATCHED}:
            out.setdefault(a.canonical_question_id, f"{a.concise_answer} {a.expanded_explanation}")
    return out


def _record(
    q: CanonicalQuestion,
    field: str,
    value: Any,
    current: Any,
    *,
    confidence: float,
    approve: bool,
    model: str,
    prompt_version: str,
    signals: dict[str, Any],
    note: str,
) -> EnrichmentProposalRecord:
    pid = proposal_id("question", q.id, field, prompt_version)
    sampled = approve and _is_sampled(pid)
    return EnrichmentProposalRecord(
        id=pid,
        target_kind="question",
        target_id=q.id,
        field=field,
        proposal_json={
            "value": value,
            "signals": signals,
            "rules_version": RULES_VERSION,
            "review_sample": sampled,
        },
        current_json={"value": current},
        model=model,
        prompt_version=prompt_version,
        confidence=round(max(0.0, min(1.0, confidence)), 4),
        status="approved" if approve else "pending",
        auto_approved=approve,
        reviewer=f"{AUTO_REVIEWER_PREFIX}{'rules+heuristic' if model == HEURISTIC_MODEL else 'rules+llm'}"
        if approve
        else None,
        review_note=note,
        decided_at=utcnow().isoformat() if approve else None,
    )


def _proposals_for_guess(
    q: CanonicalQuestion,
    guess: TaxonomyGuess,
    *,
    model: str,
    prompt_version: str,
) -> list[EnrichmentProposalRecord]:
    out: list[EnrichmentProposalRecord] = []
    signals = dict(guess.signals)
    topic_approved = False
    if _missing_topic(q) and guess.topic:
        topic_approved = guess.topic_auto_approvable
        note = (
            "heuristic topic agrees with keyword rules"
            if topic_approved
            else f"needs review: heuristic={guess.topic} rules={guess.rule_topic} "
            f"confidence={guess.topic_confidence}"
        )
        out.append(
            _record(
                q, "topic", guess.topic, q.topic,
                confidence=guess.topic_confidence, approve=topic_approved,
                model=model, prompt_version=prompt_version, signals=signals, note=note,
            )
        )
    topic_known = not _missing_topic(q) or topic_approved
    if _missing_domain(q) and guess.domain:
        declared = bool(signals.get("declared_domain"))
        approve = guess.domain_confidence >= AUTO_APPROVE_CONFIDENCE and (declared or topic_known)
        out.append(
            _record(
                q, "domain", guess.domain, q.domain.value if q.domain else None,
                confidence=guess.domain_confidence, approve=approve,
                model=model, prompt_version=prompt_version, signals=signals,
                note="source-declared track" if declared else "derived from topic (migration 038 map)",
            )
        )
    if not q.difficulty and guess.difficulty:
        approve = guess.difficulty_confidence >= AUTO_APPROVE_CONFIDENCE
        out.append(
            _record(
                q, "difficulty", guess.difficulty, q.difficulty,
                confidence=guess.difficulty_confidence, approve=approve,
                model=model, prompt_version=prompt_version, signals=signals,
                note="source label" if approve else "wording-cue guess (needs review)",
            )
        )
    return out


def _llm_proposal(q: CanonicalQuestion, client: Any) -> tuple[Any | None, str]:
    """enrich-v1 proposal via the client's tier plan; ``(proposal, route)``.

    A proposal whose topic is not a known slug counts as a validation failure
    (escalates small → primary); network / auth failures do not escalate.
    """
    from ibpe_corpus.answers.llm_client import LlmValidationError, Tier, run_tiered

    def attempt(tier: Any) -> Any:
        prop = client.propose(q, tier=tier) if tier is not None else client.propose(q)
        if normalise_topic(prop.topic) is None:
            raise LlmValidationError("unknown topic slug", errors=[f"unknown_topic:{prop.topic}"])
        return prop

    if getattr(client, "supports_tiers", False):
        plan = list(client.tier_plan())
        return run_tiered([(t, (lambda t=t: attempt(t))) for t in plan])
    return run_tiered([(Tier.SMALL, lambda: attempt(None))])


def _llm_guess(q: CanonicalQuestion, hints: SourceHints, prop: Any) -> TaxonomyGuess:
    """enrich-v1 proposal mapped onto the heuristic guess shape."""
    topic = normalise_topic(prop.topic)
    base = classify_taxonomy(
        q.canonical_wording,
        source_category=hints.category,
        source_track=hints.track,
        source_domain=hints.domain,
        source_difficulty=hints.difficulty,
        source_answer_text=hints.answer_text,
    )
    track = (prop.track or "").strip().lower()
    llm_domain = {"ib": "ib", "pe": "pe", "both": "both"}.get(track)
    conf = float(prop.confidence or 0.0)
    difficulty = (prop.difficulty or "").strip().lower() or None
    if difficulty not in {"easy", "medium", "hard"}:
        difficulty = None
    return TaxonomyGuess(
        topic=topic,
        topic_confidence=conf,
        rule_topic=base.rule_topic,
        domain=base.signals.get("declared_domain") or llm_domain or domain_for_topic(topic),
        domain_confidence=max(base.domain_confidence, conf if llm_domain else 0.0),
        difficulty=base.difficulty if base.difficulty_confidence >= 0.8 else difficulty,
        difficulty_confidence=base.difficulty_confidence
        if base.difficulty_confidence >= 0.8
        else min(conf, 0.7),
        signals={**base.signals, "llm_topic": topic, "llm_track": track or None},
    )


def heuristic_sufficient(records: Sequence[EnrichmentProposalRecord]) -> bool:
    """Skip the model: every topic / domain proposal is already auto-approved.

    Difficulty is excluded — an LLM difficulty guess is capped below the
    auto-approve bar, so calling the model for it would never change status.
    """
    return all(r.status == "approved" for r in records if r.field in {"topic", "domain"})


def propose_taxonomy(
    questions: Sequence[CanonicalQuestion],
    hints: dict[str, SourceHints],
    *,
    client: Any | None = None,
    routes: Any | None = None,
) -> list[EnrichmentProposalRecord]:
    """Proposals for every teaching question missing topic / domain / difficulty.

    ``routes`` (an :class:`~ibpe_corpus.answers.llm_client.LlmRouteCounts`)
    records whether each question was settled by the heuristic, the small or
    primary model, or fell back after a failed model call.
    """
    use_llm = client is not None and not getattr(client, "dry_run", True)
    out: list[EnrichmentProposalRecord] = []
    for q in questions:
        if not (_missing_topic(q) or _missing_domain(q) or not q.difficulty):
            continue
        h = hints.get(q.id) or SourceHints()
        heuristic = classify_taxonomy(
            q.canonical_wording,
            source_category=h.category,
            source_track=h.track,
            source_domain=h.domain,
            source_difficulty=h.difficulty,
            source_answer_text=h.answer_text,
        )
        records = _proposals_for_guess(
            q, heuristic, model=HEURISTIC_MODEL, prompt_version=HEURISTIC_PROMPT_VERSION
        )
        route = "heuristic"
        if use_llm and not heuristic_sufficient(records):
            prop, route = _llm_proposal(q, client)
            if prop is not None:
                from ibpe_corpus.answers.llm_client import ENRICH_PROMPT_VERSION

                model = str(prop.model_version or getattr(client, "model", "llm"))
                records = _proposals_for_guess(
                    q, _llm_guess(q, h, prop), model=model, prompt_version=ENRICH_PROMPT_VERSION
                )
        if routes is not None:
            routes.record(route)
        out.extend(records)
    return out


def apply_approved(
    questions: Sequence[CanonicalQuestion],
    proposals: Iterable[EnrichmentProposalRecord],
) -> tuple[list[CanonicalQuestion], int]:
    """Apply ``approved`` question proposals (topic / domain / difficulty) in memory."""
    by_q: dict[str, list[EnrichmentProposalRecord]] = {}
    for p in proposals:
        if p.target_kind == "question" and p.status in {"approved", "applied"}:
            by_q.setdefault(p.target_id, []).append(p)
    applied = 0
    out: list[CanonicalQuestion] = []
    for q in questions:
        updates: dict[str, Any] = {}
        for p in by_q.get(q.id, []):
            value = (p.proposal_json or {}).get("value")
            if value is None:
                continue
            if p.field == "topic" and _missing_topic(q) and "topic" not in updates:
                updates["topic"] = value
            elif p.field == "domain" and _missing_domain(q) and "domain" not in updates:
                try:
                    updates["domain"] = Domain(value)
                except ValueError:
                    continue
            elif p.field == "difficulty" and not q.difficulty and "difficulty" not in updates:
                updates["difficulty"] = value
        if updates:
            applied += len(updates)
            q = q.model_copy(update=updates)
        out.append(q)
    return out, applied


def run_taxonomy_enrichment(
    questions: Sequence[CanonicalQuestion],
    hints: dict[str, SourceHints],
    *,
    proposal_store: ProposalStore | None = None,
    review_queue: EditorialReviewQueue | None = None,
    client: Any | None = None,
    routes: Any | None = None,
) -> tuple[list[CanonicalQuestion], list[EnrichmentProposalRecord], dict[str, Any]]:
    """Propose → persist → queue reviews → apply approved. Returns metrics."""
    store = proposal_store or ProposalStore()
    queue = review_queue or EditorialReviewQueue()
    proposals = store.upsert_many(propose_taxonomy(questions, hints, client=client, routes=routes))
    for p in proposals:
        sampled = bool((p.proposal_json or {}).get("review_sample"))
        if p.status == "pending" or sampled:
            queue.enqueue(
                canonical_question_id=p.target_id,
                enrichment_id=p.id,
                reason="taxonomy_review_sample" if sampled else f"taxonomy_{p.field}_needs_review",
                priority=0 if sampled else 1,
                metadata={"field": p.field, "value": (p.proposal_json or {}).get("value"),
                          "confidence": p.confidence},
                item_id=f"edq_{p.id[5:]}",
            )
    updated, applied = apply_approved(questions, proposals)
    by_status: dict[str, int] = {}
    for p in proposals:
        by_status[p.status] = by_status.get(p.status, 0) + 1
    metrics = {
        "taxonomy_proposals": len(proposals),
        "taxonomy_auto_approved": sum(1 for p in proposals if p.auto_approved),
        "taxonomy_pending": by_status.get("pending", 0),
        "taxonomy_review_samples": sum(
            1 for p in proposals if (p.proposal_json or {}).get("review_sample")
        ),
        "taxonomy_fields_applied": applied,
        "taxonomy_mode": "llm" if client is not None and not getattr(client, "dry_run", True) else "heuristic",
    }
    return updated, proposals, metrics


def rule_topic_for(text: str) -> str:
    """Convenience re-export for callers that only need the keyword rules."""
    return infer_topic(text)
