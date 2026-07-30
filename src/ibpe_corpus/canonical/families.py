"""Question relationship graph (families of related interview questions)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field
from rapidfuzz import fuzz

from ibpe_corpus.canonical.embeddings import cosine_similarity, hashing_embed
from ibpe_corpus.canonical.normalise import normalise_for_hash
from ibpe_corpus.schemas.models import CanonicalQuestion, QuestionVariant, new_id

RelationshipType = Literal[
    "prerequisite",
    "follow_up",
    "related",
    "duplicate_candidate",
]

# Topic ladders: earlier items are typical prerequisites of later ones.
_TOPIC_LADDERS: list[list[str]] = [
    ["three statements", "income statement", "balance sheet", "cash flow"],
    ["ebitda", "enterprise value", "equity value"],
    ["wacc", "dcf", "terminal value"],
    ["lbo", "paper lbo", "returns", "moic", "irr"],
    ["comps", "trading comps", "precedent transactions"],
    ["accretion", "dilution", "merger model"],
]


class QuestionRelationship(BaseModel):
    id: str = Field(default_factory=lambda: new_id("rel"))
    from_question_id: str
    to_question_id: str
    relationship_type: RelationshipType
    confidence: float = 1.0
    reversible: bool = True
    audit: dict[str, Any] = Field(default_factory=dict)


def _ladder_index(text: str) -> list[tuple[int, int]]:
    """Return (ladder_idx, step_idx) hits for known topic ladders."""
    norm = normalise_for_hash(text)
    hits: list[tuple[int, int]] = []
    for li, ladder in enumerate(_TOPIC_LADDERS):
        for si, term in enumerate(ladder):
            if term in norm:
                hits.append((li, si))
    return hits


def _infer_ladder_edge(
    a: CanonicalQuestion, b: CanonicalQuestion
) -> tuple[RelationshipType, float] | None:
    hits_a = _ladder_index(a.canonical_wording)
    hits_b = _ladder_index(b.canonical_wording)
    shared_ladders = {li for li, _ in hits_a} & {li for li, _ in hits_b}
    if not shared_ladders:
        return None
    for li in shared_ladders:
        steps_a = [si for lj, si in hits_a if lj == li]
        steps_b = [si for lj, si in hits_b if lj == li]
        if not steps_a or not steps_b:
            continue
        min_a, min_b = min(steps_a), min(steps_b)
        if min_a < min_b:
            return ("prerequisite", 0.75)
        if min_a > min_b:
            return ("follow_up", 0.75)
        return ("related", 0.7)
    return None


def build_relationship_graph(
    questions: list[CanonicalQuestion],
    variants: list[QuestionVariant] | None = None,
    *,
    duplicate_threshold: float = 85.0,
    related_cosine: float = 0.55,
) -> list[QuestionRelationship]:
    """Build relationship edges among canonical questions.

    Relationship types:
    - ``prerequisite`` / ``follow_up`` from known IB/PE topic ladders
    - ``related`` from embedding neighbourhood or shared ladder step
    - ``duplicate_candidate`` from high fuzzy score without an exact merge
    """
    _ = variants  # reserved for future variant-aware edges
    relationships: list[QuestionRelationship] = []
    seen: set[tuple[str, str, str]] = set()

    def _add(
        frm: str,
        to: str,
        rel_type: RelationshipType,
        confidence: float,
        **audit: Any,
    ) -> None:
        key = (frm, to, rel_type)
        if key in seen:
            return
        # For symmetric "related" / "duplicate_candidate", collapse either direction.
        if rel_type in ("related", "duplicate_candidate") and (to, frm, rel_type) in seen:
            return
        seen.add(key)
        relationships.append(
            QuestionRelationship(
                from_question_id=frm,
                to_question_id=to,
                relationship_type=rel_type,
                confidence=confidence,
                reversible=True,
                audit=dict(audit),
            )
        )

    embeddings = {q.id: hashing_embed(q.canonical_wording) for q in questions}
    norms = {q.id: normalise_for_hash(q.canonical_wording) for q in questions}

    for i, qa in enumerate(questions):
        for qb in questions[i + 1 :]:
            fuzzy = float(fuzz.token_set_ratio(norms[qa.id], norms[qb.id]))
            if fuzzy >= duplicate_threshold:
                _add(
                    qa.id,
                    qb.id,
                    "duplicate_candidate",
                    fuzzy / 100.0,
                    fuzzy_score=fuzzy,
                )

            ladder = _infer_ladder_edge(qa, qb)
            if ladder is not None:
                rel_type, conf = ladder
                if rel_type == "prerequisite":
                    _add(qa.id, qb.id, "prerequisite", conf, via="topic_ladder")
                    _add(qb.id, qa.id, "follow_up", conf, via="topic_ladder")
                elif rel_type == "follow_up":
                    _add(qa.id, qb.id, "follow_up", conf, via="topic_ladder")
                    _add(qb.id, qa.id, "prerequisite", conf, via="topic_ladder")
                else:
                    _add(qa.id, qb.id, "related", conf, via="topic_ladder")

            cos = cosine_similarity(embeddings[qa.id], embeddings[qb.id])
            if cos >= related_cosine and fuzzy < duplicate_threshold:
                _add(qa.id, qb.id, "related", float(cos), cosine=cos)

    return relationships
