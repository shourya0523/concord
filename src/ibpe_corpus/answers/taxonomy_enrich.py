"""Taxonomy enrichment (plan P2.2): topic / domain / difficulty for teaching Qs.

Two proposers, one policy:

* **Heuristic** (no key, no network): :func:`classify_taxonomy` combines the
  source's own category / track / difficulty labels, keyword rules (migration
  038 + v4) on the wording, and rules on the *source-provided* answer.
* **Jev** (``typesafe/jev-1.13`` decision model via
  :class:`~ibpe_corpus.answers.decisions_client.DecisionsClient`) when
  ``OPENROUTER_API_KEY`` is set — **only when required**: the heuristic runs
  first and Jev is asked only about the missing fields the heuristic could not
  auto-approve, in ONE request per question (``choice`` topic over the 038
  slugs, ``choice`` domain ``ib|pe|both|other``, ``score`` difficulty
  ``easy<medium<hard``, and ``choice`` PE strategy when the question is PE).
  No chat model is used for taxonomy.

Heuristic auto-approval: a topic proposal is approved only when the heuristic
topic equals the keyword-rule topic **and** confidence ≥ 0.8. Domain is
approved when it is source-declared, or derived from an approved topic; ib-vs-pe
conflicts between a source track and a topic resolve to ``both``. Difficulty is
approved only when it comes from the source's own label (or ``adv-*`` category
names); wording-cue guesses stay pending.

Jev auto-approval (per field): confidence ≥ ``JEV_AUTO_APPROVE`` (default 0.8)
**and** agreement with the keyword rules (rule topic / declared-or-mapped domain
/ heuristic difficulty / alias-matched PE strategy), or confidence ≥ 0.9 alone.
A domain of ``other`` never auto-approves (it does not fill the gap).

A deterministic ~10% of auto-approvals is flagged ``review_sample`` and queued
for human spot-checks. Everything else is a ``pending`` proposal in the
editorial queue — never applied.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from ibpe_corpus.answers.decisions_client import (
    JEV_SOLO_APPROVE,
    DecisionResponse,
    jev_auto_approve,
)
from ibpe_corpus.answers.editorial import EditorialReviewQueue
from ibpe_corpus.answers.jev_questions import (
    DIFFICULTY_LEVELS,
    TAXONOMY_JEV_PROMPT_VERSION,
    question_state,
    rule_pe_strategy,
    taxonomy_questions,
)
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

log = logging.getLogger(__name__)

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
    reviewer: str | None = None,
) -> EnrichmentProposalRecord:
    pid = proposal_id("question", q.id, field, prompt_version)
    who = reviewer or ("rules+heuristic" if model == HEURISTIC_MODEL else "rules+llm")
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
        reviewer=f"{AUTO_REVIEWER_PREFIX}{who}" if approve else None,
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


def _missing_fields(q: CanonicalQuestion) -> set[str]:
    out: set[str] = set()
    if _missing_topic(q):
        out.add("topic")
    if _missing_domain(q):
        out.add("domain")
    if not q.difficulty:
        out.add("difficulty")
    return out


def jev_fields(q: CanonicalQuestion, records: Sequence[EnrichmentProposalRecord]) -> set[str]:
    """Missing fields the heuristic could not auto-approve (what Jev is asked)."""
    approved = {r.field for r in records if r.status == "approved"}
    return _missing_fields(q) - approved


def heuristic_sufficient(
    records: Sequence[EnrichmentProposalRecord], q: CanonicalQuestion | None = None
) -> bool:
    """Skip the network: every missing field already has an auto-approved proposal.

    Without ``q`` (legacy callers) only topic / domain proposals are checked.
    """
    if q is None:
        return all(r.status == "approved" for r in records if r.field in {"topic", "domain"})
    return not jev_fields(q, records)


def _approve(value: Any, confidence: float, rule: Any) -> tuple[bool, str]:
    bar = jev_auto_approve()
    if value is None:
        return False, "no Jev answer"
    if rule is not None and value == rule and confidence >= bar:
        return True, f"Jev agrees with keyword rules (confidence {confidence:.2f} >= {bar:.2f})"
    if confidence >= JEV_SOLO_APPROVE:
        return True, f"Jev confidence {confidence:.2f} >= {JEV_SOLO_APPROVE:.2f}"
    return False, f"needs review: jev={value} rules={rule} confidence={confidence:.2f}"


def _answer_json(ans: Any) -> dict[str, Any]:
    return ans.model_dump(mode="json", exclude={"type", "legend"}, exclude_none=True)


def _jev_records(
    q: CanonicalQuestion,
    guess: TaxonomyGuess,
    hints: SourceHints,
    resp: DecisionResponse,
    heuristic: Sequence[EnrichmentProposalRecord],
    *,
    asked: set[str],
    model: str,
) -> list[EnrichmentProposalRecord]:
    """Proposals from one Jev response; un-asked fields keep their heuristic record."""
    out = [r for r in heuristic if r.field not in asked]
    heur_by_field = {r.field: r for r in heuristic}
    signals: dict[str, Any] = {
        **guess.signals,
        "jev": {k: _answer_json(a) for k, a in resp.answers.items() if k in asked},
    }
    common = dict(model=model, prompt_version=TAXONOMY_JEV_PROMPT_VERSION, signals=signals,
                  reviewer="rules+jev")
    topic_now = None if _missing_topic(q) else q.topic
    if "topic" in asked:
        ans = resp.choice("topic")
        rule = guess.rule_topic if guess.rule_topic != UNTAGGED else None
        approve, note = _approve(ans.choice, ans.conf, rule)
        if approve:
            topic_now = ans.choice
        out.append(_record(q, "topic", ans.choice, q.topic, confidence=ans.conf, approve=approve,
                           note=note, **common))
    elif "topic" in heur_by_field and heur_by_field["topic"].status == "approved":
        topic_now = (heur_by_field["topic"].proposal_json or {}).get("value")
    if "domain" in asked:
        ans = resp.choice("domain")
        declared = guess.signals.get("declared_domain")
        rule = declared or domain_for_topic(topic_now or guess.rule_topic)
        approve, note = _approve(ans.choice, ans.conf, rule)
        if ans.choice == Domain.OTHER.value:
            approve, note = False, "needs review: Jev says not an IB/PE question"
        out.append(_record(q, "domain", ans.choice, q.domain.value if q.domain else None,
                           confidence=ans.conf, approve=approve, note=note, **common))
    if "difficulty" in asked:
        ans = resp.score("difficulty")
        value = DIFFICULTY_LEVELS[ans.index(len(DIFFICULTY_LEVELS))]
        approve, note = _approve(value, ans.conf, guess.difficulty)
        out.append(_record(q, "difficulty", value, q.difficulty, confidence=ans.conf,
                           approve=approve, note=note, **common))
    if "pe_strategy" in asked:
        ans = resp.choice("pe_strategy")
        if ans.choice != "general":
            rule = rule_pe_strategy(" ".join(filter(None, [q.canonical_wording, hints.answer_text])))
            approve, note = _approve(ans.choice, ans.conf, rule)
            out.append(_record(q, "pe_strategy", ans.choice, q.pe_strategy, confidence=ans.conf,
                               approve=approve, note=note, **common))
    return out


def _is_pe(q: CanonicalQuestion, records: Sequence[EnrichmentProposalRecord]) -> bool:
    if q.domain == Domain.PE:
        return True
    return any(
        r.field == "domain" and r.status == "approved" and (r.proposal_json or {}).get("value") == "pe"
        for r in records
    )


def propose_taxonomy(
    questions: Sequence[CanonicalQuestion],
    hints: dict[str, SourceHints],
    *,
    decider: Any | None = None,
    routes: Any | None = None,
) -> list[EnrichmentProposalRecord]:
    """Proposals for every teaching question missing topic / domain / difficulty.

    ``decider`` is a :class:`~ibpe_corpus.answers.decisions_client.DecisionsClient`
    (Jev); it is called once per question, and only for questions whose missing
    fields the heuristic could not auto-approve. ``routes`` (an
    :class:`~ibpe_corpus.answers.llm_client.LlmRouteCounts`) records whether each
    question was settled by the heuristic, by Jev, or kept the heuristic after a
    failed Jev call.
    """
    from ibpe_corpus.answers.llm_client import LlmError

    use_jev = decider is not None and not getattr(decider, "dry_run", True)
    out: list[EnrichmentProposalRecord] = []
    for q in questions:
        if not _missing_fields(q):
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
        ask = jev_fields(q, records) if use_jev else set()
        if ask:
            if not q.pe_strategy and (_is_pe(q, records) or heuristic.domain == "pe"):
                ask.add("pe_strategy")  # rides along in the same request
            state = question_state(
                q.canonical_wording,
                source_category=h.category,
                source_track=h.track,
                source_answer=h.answer_text,
            )
            try:
                resp = decider.decide(state, taxonomy_questions(ask))
            except LlmError as exc:
                route = "failed"  # keep the heuristic proposals
                log.warning("jev taxonomy failed for %s: %s", q.id, type(exc).__name__)
            else:
                route = "jev"
                model = resp.model or getattr(decider, "model", "jev")
                records = _jev_records(q, heuristic, h, resp, records, asked=ask, model=model)
        if routes is not None:
            routes.record(route)
        out.extend(records)
    return out


def apply_approved(
    questions: Sequence[CanonicalQuestion],
    proposals: Iterable[EnrichmentProposalRecord],
) -> tuple[list[CanonicalQuestion], int]:
    """Apply ``approved`` question proposals (topic / domain / difficulty / pe_strategy) in memory."""
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
            elif p.field == "pe_strategy" and not q.pe_strategy and "pe_strategy" not in updates:
                updates["pe_strategy"] = value
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
    decider: Any | None = None,
    routes: Any | None = None,
) -> tuple[list[CanonicalQuestion], list[EnrichmentProposalRecord], dict[str, Any]]:
    """Propose → persist → queue reviews → apply approved. Returns metrics."""
    store = proposal_store or ProposalStore()
    queue = review_queue or EditorialReviewQueue()
    proposals = store.upsert_many(propose_taxonomy(questions, hints, decider=decider, routes=routes))
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
        "taxonomy_mode": "jev" if decider is not None and not getattr(decider, "dry_run", True) else "heuristic",
    }
    return updated, proposals, metrics


def rule_topic_for(text: str) -> str:
    """Convenience re-export for callers that only need the keyword rules."""
    return infer_topic(text)
