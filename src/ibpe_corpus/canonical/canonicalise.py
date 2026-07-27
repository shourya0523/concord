"""Canonicalise extracted records into questions, variants, and merge audits."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

from rapidfuzz import fuzz

from ibpe_corpus.canonical.embeddings import hashing_embed
from ibpe_corpus.canonical.normalise import clean_whitespace, normalise_for_hash, normalised_hash
from ibpe_corpus.schemas.models import (
    CanonicalQuestion,
    Domain,
    ExtractionClass,
    ExtractedRecord,
    InterviewOccurrence,
    PERelevance,
    QuestionVariant,
    new_id,
)

DEFAULT_FUZZY_THRESHOLD = 92.0

_QUESTION_TYPES = {
    ExtractionClass.EXACT_QUESTION,
    ExtractionClass.PARAPHRASED_QUESTION,
    ExtractionClass.TOPIC_SIGNAL,
}

_VARIANT_TYPE: dict[ExtractionClass, Literal["exact", "paraphrase", "topic_signal"]] = {
    ExtractionClass.EXACT_QUESTION: "exact",
    ExtractionClass.PARAPHRASED_QUESTION: "paraphrase",
    ExtractionClass.TOPIC_SIGNAL: "topic_signal",
}

# Distinctive finance concepts — differing sets mean different answers.
_DISTINCTIVE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("dcf", re.compile(r"\bdcf\b|discounted cash flow", re.I)),
    ("lbo", re.compile(r"\blbo\b|leveraged buyout|levered buyout", re.I)),
    ("wacc", re.compile(r"\bwacc\b|weighted average cost of capital", re.I)),
    ("ebitda", re.compile(r"\bebitda\b", re.I)),
    ("enterprise_value", re.compile(r"\benterprise value\b|\bev\b", re.I)),
    ("equity_value", re.compile(r"\bequity value\b", re.I)),
    ("merger", re.compile(r"\bmerger\b|\bm&a\b|accretion|dilution", re.I)),
    ("comps", re.compile(r"\bcomps?\b|comparable compan|trading multipl", re.I)),
    ("precedents", re.compile(r"\bprecedent transaction", re.I)),
    ("three_statements", re.compile(r"\bthree statements?\b|link(?:ing)? the (?:three )?statements", re.I)),
    ("working_capital", re.compile(r"\bworking capital\b", re.I)),
    ("beta", re.compile(r"\bbeta\b", re.I)),
    ("irr", re.compile(r"\birr\b|internal rate of return", re.I)),
    ("moic", re.compile(r"\bmoic\b|money[- ]on[- ]money", re.I)),
    ("paper_lbo", re.compile(r"\bpaper lbo\b", re.I)),
    ("football_field", re.compile(r"\bfootball field\b", re.I)),
]

# Question mark then another capitalised question-like clause.
_Q_FOLLOW_RE = re.compile(r"\?\s+(?=[A-Z][^?]{8,})")


@dataclass
class CanonicalisationResult:
    questions: list[CanonicalQuestion] = field(default_factory=list)
    variants: list[QuestionVariant] = field(default_factory=list)
    occurrences: list[InterviewOccurrence] = field(default_factory=list)
    merge_audits: list[dict[str, Any]] = field(default_factory=list)


def split_multi_questions(text: str) -> list[tuple[str, dict[str, Any]]]:
    """Split multi-question text when numbering or Q-after-? is clear.

    Returns ``(segment, metadata)`` pairs. Metadata always includes
    ``parent_span`` (the original unsplit text) when a split occurs.
    """
    raw = text or ""
    cleaned = clean_whitespace(raw)
    if not cleaned:
        return []

    parts = _split_numbered(cleaned)
    if len(parts) <= 1:
        parts = _split_question_followons(cleaned)

    if len(parts) <= 1:
        return [(cleaned, {})]

    parent = cleaned
    return [
        (
            part,
            {
                "parent_span": parent,
                "split_index": idx,
                "split_count": len(parts),
            },
        )
        for idx, part in enumerate(parts)
    ]


def _split_numbered(text: str) -> list[str]:
    # Require at least two numbered markers to treat as a list.
    markers = list(re.finditer(r"(?:^|\n)\s*(?:\(?\d+\)?[.\)]\s+)", text))
    if len(markers) < 2:
        # Also allow inline "1. ... 2. ..." without newlines.
        markers = list(re.finditer(r"(?:^|[.!?]\s+|\s)(\d+[.)]\s+)(?=[A-Z])", text))
        if len(markers) < 2:
            return [text]
        spans: list[tuple[int, int]] = []
        for i, m in enumerate(markers):
            start = m.start(1)
            end = markers[i + 1].start(1) if i + 1 < len(markers) else len(text)
            spans.append((start, end))
        parts = [text[s:e].strip() for s, e in spans]
        # Strip leading numbers from each part.
        return [_strip_leading_number(p) for p in parts if _strip_leading_number(p)]

    parts = []
    for i, m in enumerate(markers):
        start = m.end()
        end = markers[i + 1].start() if i + 1 < len(markers) else len(text)
        chunk = text[start:end].strip()
        if chunk:
            parts.append(chunk)
    return parts if len(parts) >= 2 else [text]


def _strip_leading_number(text: str) -> str:
    return re.sub(r"^\(?\d+\)?[.)]\s*", "", text).strip()


def _split_question_followons(text: str) -> list[str]:
    if not _Q_FOLLOW_RE.search(text):
        return [text]
    parts = _Q_FOLLOW_RE.split(text)
    # re.split with lookahead-ish pattern: our pattern consumes "? " so restore ?
    # Actually the pattern is `\?\s+(?=...)` so "?" is consumed. Re-attach.
    rebuilt: list[str] = []
    # Find split points including the "?"
    pieces: list[str] = []
    last = 0
    for m in re.finditer(r"\?\s+(?=[A-Z][^?]{8,})", text):
        pieces.append(text[last : m.start() + 1].strip())  # include ?
        last = m.end()
    pieces.append(text[last:].strip())
    rebuilt = [p for p in pieces if p]
    return rebuilt if len(rebuilt) >= 2 else [text]


def distinctive_concepts(text: str) -> frozenset[str]:
    """Return distinctive finance concepts present in ``text``."""
    found = {name for name, pattern in _DISTINCTIVE_PATTERNS if pattern.search(text or "")}
    return frozenset(found)


def same_answer_would_satisfy(text_a: str, text_b: str) -> bool:
    """True when a single substantive answer could satisfy both wordings.

    If both sides mention distinctive concepts and the sets differ, refuse merge
    (e.g. DCF vs LBO walkthroughs).
    """
    a = distinctive_concepts(text_a)
    b = distinctive_concepts(text_b)
    if not a or not b:
        return True
    return a == b


def _record_kind(record: ExtractedRecord) -> ExtractionClass | None:
    rt = record.record_type
    if isinstance(rt, ExtractionClass):
        return rt if rt in _QUESTION_TYPES else None
    try:
        parsed = ExtractionClass(rt)
    except ValueError:
        return None
    return parsed if parsed in _QUESTION_TYPES else None


def _meta_domain(meta: dict[str, Any]) -> Domain:
    raw = meta.get("domain")
    if raw is None:
        return Domain.OTHER
    try:
        return Domain(raw)
    except ValueError:
        return Domain.OTHER


def _meta_pe_relevance(meta: dict[str, Any]) -> PERelevance | None:
    raw = meta.get("pe_relevance")
    if raw is None:
        return None
    try:
        return PERelevance(raw)
    except ValueError:
        return None


def _variant_type_for(kind: ExtractionClass) -> Literal["exact", "paraphrase", "topic_signal"]:
    return _VARIANT_TYPE[kind]


def _occurrence_from_meta(
    variant_id: str,
    record: ExtractedRecord,
    meta: dict[str, Any],
) -> InterviewOccurrence | None:
    employer = meta.get("employer")
    role = meta.get("role")
    review_id = meta.get("interview_review_id") or meta.get("review_id")
    office = meta.get("office")
    round_ = meta.get("round")
    interview_date = meta.get("interview_date") or meta.get("date")
    outcome = meta.get("outcome")
    detail_url = meta.get("detail_url")
    employer_id = meta.get("employer_id")
    recruiting_cycle = meta.get("recruiting_cycle")
    confidence = float(meta.get("occurrence_confidence", record.grounding_confidence))

    has_context = any(
        v is not None
        for v in (employer, role, review_id, office, round_, interview_date, detail_url)
    )
    if not has_context:
        return None

    return InterviewOccurrence(
        question_variant_id=variant_id,
        interview_review_id=review_id,
        employer=employer,
        employer_id=employer_id,
        role=role,
        office=office,
        round=round_,
        interview_date=interview_date,
        recruiting_cycle=recruiting_cycle,
        outcome=outcome,
        source_id=record.source_artefact_id,
        confidence=confidence,
        detail_url=detail_url,
    )


@dataclass
class _Cluster:
    canonical: CanonicalQuestion
    kinds: set[ExtractionClass] = field(default_factory=set)
    variant_ids: list[str] = field(default_factory=list)
    wordings: list[str] = field(default_factory=list)


def canonicalise(
    records: list[ExtractedRecord],
    *,
    fuzzy_threshold: float = DEFAULT_FUZZY_THRESHOLD,
    attach_embeddings: bool = True,
) -> CanonicalisationResult:
    """Build canonical questions + variants from extracted records.

    Merge policy:
    - Exact merge on ``normalised_hash``
    - Fuzzy merge via rapidfuzz ``token_set_ratio`` when score >= threshold
      *and* ``same_answer_would_satisfy``
    - ``topic_signal`` never upgrades to fabricated exact wording and never
      merges into exact/paraphrase clusters (and vice versa)
    """
    result = CanonicalisationResult()
    clusters: list[_Cluster] = []
    hash_index: dict[str, int] = {}  # normalised_hash -> cluster idx (non-topic)
    topic_hash_index: dict[str, int] = {}

    for record in records:
        kind = _record_kind(record)
        if kind is None:
            continue

        segments = split_multi_questions(record.exact_source_text)
        for segment, split_meta in segments:
            cleaned = clean_whitespace(segment)
            if not cleaned:
                continue
            n_hash = normalised_hash(cleaned)
            norm = normalise_for_hash(cleaned)
            is_topic = kind == ExtractionClass.TOPIC_SIGNAL

            meta = dict(record.extracted_metadata or {})
            if split_meta:
                meta = {**meta, **split_meta}
                if record.source_selector_or_span:
                    meta.setdefault("parent_selector_or_span", record.source_selector_or_span)

            match = _find_cluster(
                clusters,
                hash_index,
                topic_hash_index,
                n_hash=n_hash,
                norm=norm,
                wording=cleaned,
                is_topic=is_topic,
                fuzzy_threshold=fuzzy_threshold,
            )

            if match is None:
                # topic_signal must not become fabricated exact question wording.
                if is_topic:
                    canonical_wording = cleaned
                    question_type = "topic"
                    review_state = "topic_signal"
                else:
                    canonical_wording = cleaned
                    question_type = str(meta.get("question_type") or "technical")
                    review_state = "accepted"

                cq = CanonicalQuestion(
                    canonical_wording=canonical_wording,
                    question_type=question_type,
                    topic=meta.get("topic"),
                    subtopic=meta.get("subtopic"),
                    domain=_meta_domain(meta),
                    pe_strategy=meta.get("pe_strategy"),
                    pe_relevance=_meta_pe_relevance(meta),
                    seniority=meta.get("seniority"),
                    difficulty=meta.get("difficulty"),
                    review_state=review_state,
                    normalised_hash=n_hash,
                )
                cluster_idx = len(clusters)
                clusters.append(_Cluster(canonical=cq, kinds={kind}, wordings=[cleaned]))
                if is_topic:
                    topic_hash_index[n_hash] = cluster_idx
                else:
                    hash_index[n_hash] = cluster_idx
            else:
                cluster_idx, merge_reason, merge_score = match
                cluster = clusters[cluster_idx]
                prior_snapshot = cluster.canonical.model_dump(mode="json")
                cluster.kinds.add(kind)
                cluster.wordings.append(cleaned)
                # Prefer exact wording as canonical when merging paraphrase into exact.
                if (
                    kind == ExtractionClass.EXACT_QUESTION
                    and cluster.canonical.review_state != "topic_signal"
                ):
                    cluster.canonical.canonical_wording = cleaned
                    cluster.canonical.normalised_hash = n_hash
                    hash_index[n_hash] = cluster_idx
                elif n_hash not in (topic_hash_index if is_topic else hash_index):
                    (topic_hash_index if is_topic else hash_index)[n_hash] = cluster_idx

                # Reversible audit: joining an existing survivor cluster.
                # Use a synthetic merged_id for the absorbed wording instance.
                absorbed_id = new_id("cq")
                result.merge_audits.append(
                    {
                        "id": new_id("mrg"),
                        "survivor_id": cluster.canonical.id,
                        "merged_id": absorbed_id,
                        "reason": merge_reason,
                        "reversible": True,
                        "payload": {
                            "fuzzy_score": merge_score,
                            "merged_question": {
                                "id": absorbed_id,
                                "canonical_wording": cleaned,
                                "question_type": (
                                    "topic"
                                    if is_topic
                                    else str(meta.get("question_type") or "technical")
                                ),
                                "topic": meta.get("topic"),
                                "subtopic": meta.get("subtopic"),
                                "domain": _meta_domain(meta).value,
                                "pe_strategy": meta.get("pe_strategy"),
                                "pe_relevance": (
                                    _meta_pe_relevance(meta).value
                                    if _meta_pe_relevance(meta)
                                    else None
                                ),
                                "seniority": meta.get("seniority"),
                                "difficulty": meta.get("difficulty"),
                                "review_state": (
                                    "topic_signal" if is_topic else "accepted"
                                ),
                                "normalised_hash": n_hash,
                            },
                            "survivor_question": prior_snapshot,
                            "merged_wording": cleaned,
                            "source_record_id": record.id,
                            "reassigned_variant_ids": [],  # filled after variant create
                        },
                    }
                )

            cluster = clusters[cluster_idx]
            embedding = hashing_embed(cleaned) if attach_embeddings else None
            variant = QuestionVariant(
                canonical_question_id=cluster.canonical.id,
                source_wording=record.exact_source_text if not split_meta else cleaned,
                cleaned_wording=cleaned,
                normalised_hash=n_hash,
                variant_type=_variant_type_for(kind),
                source_artefact_id=record.source_artefact_id,
                embedding=embedding,
            )
            cluster.variant_ids.append(variant.id)
            result.variants.append(variant)

            # Attach variant id to the latest merge audit for this join, if any.
            if match is not None and result.merge_audits:
                latest = result.merge_audits[-1]
                if latest.get("survivor_id") == cluster.canonical.id:
                    latest["payload"]["reassigned_variant_ids"] = [variant.id]

            occ = _occurrence_from_meta(variant.id, record, meta)
            if occ is not None:
                result.occurrences.append(occ)

    # Second pass: fuzzy merges across clusters created before mutual neighbours
    # were visible (rare with streaming insert, kept for completeness).
    result.merge_audits.extend(
        _fuzzy_merge_clusters(clusters, result.variants, fuzzy_threshold=fuzzy_threshold)
    )

    result.questions = [c.canonical for c in clusters if c.wordings]
    surviving = {q.id for q in result.questions}
    result.variants = [v for v in result.variants if v.canonical_question_id in surviving]
    result.occurrences = [
        o
        for o in result.occurrences
        if any(v.id == o.question_variant_id for v in result.variants)
    ]
    return result


def _find_cluster(
    clusters: list[_Cluster],
    hash_index: dict[str, int],
    topic_hash_index: dict[str, int],
    *,
    n_hash: str,
    norm: str,
    wording: str,
    is_topic: bool,
    fuzzy_threshold: float,
) -> tuple[int, str, float] | None:
    """Return ``(cluster_idx, reason, score)`` when a merge target exists."""
    index = topic_hash_index if is_topic else hash_index
    if n_hash in index:
        return index[n_hash], "exact_hash", 100.0

    best_idx: int | None = None
    best_score = -1.0
    for idx, cluster in enumerate(clusters):
        cluster_is_topic = _cluster_is_topic(cluster)
        if is_topic != cluster_is_topic:
            continue
        if not cluster.wordings:
            continue
        other_norm = normalise_for_hash(cluster.canonical.canonical_wording)
        score = float(fuzz.token_set_ratio(norm, other_norm))
        if score < fuzzy_threshold:
            continue
        if not same_answer_would_satisfy(wording, cluster.canonical.canonical_wording):
            continue
        if score > best_score:
            best_score = score
            best_idx = idx
    if best_idx is None:
        return None
    return best_idx, "fuzzy_match", best_score


def _fuzzy_merge_clusters(
    clusters: list[_Cluster],
    variants: list[QuestionVariant],
    *,
    fuzzy_threshold: float,
) -> list[dict[str, Any]]:
    """Merge remaining near-duplicate clusters; return reversible audit entries."""
    audits: list[dict[str, Any]] = []
    alive = [i for i, c in enumerate(clusters) if c.wordings]

    changed = True
    while changed:
        changed = False
        alive = [i for i in alive if clusters[i].wordings]
        for i_pos, i in enumerate(list(alive)):
            if not clusters[i].wordings:
                continue
            for j in list(alive[i_pos + 1 :]):
                if not clusters[j].wordings:
                    continue
                a, b = clusters[i], clusters[j]
                a_topic = _cluster_is_topic(a)
                b_topic = _cluster_is_topic(b)
                if a_topic != b_topic:
                    continue
                score = float(
                    fuzz.token_set_ratio(
                        normalise_for_hash(a.canonical.canonical_wording),
                        normalise_for_hash(b.canonical.canonical_wording),
                    )
                )
                if score < fuzzy_threshold:
                    continue
                if not same_answer_would_satisfy(
                    a.canonical.canonical_wording, b.canonical.canonical_wording
                ):
                    continue

                # Prefer exact-bearing cluster as survivor; else lower index.
                if ExtractionClass.EXACT_QUESTION in b.kinds and (
                    ExtractionClass.EXACT_QUESTION not in a.kinds
                ):
                    survivor, merged = b, a
                    survivor_idx, merged_idx = j, i
                else:
                    survivor, merged = a, b
                    survivor_idx, merged_idx = i, j

                reason = "exact_hash" if (
                    survivor.canonical.normalised_hash
                    and survivor.canonical.normalised_hash == merged.canonical.normalised_hash
                ) else "fuzzy_match"

                reassigned = list(merged.variant_ids)
                for vid in reassigned:
                    for variant in variants:
                        if variant.id == vid:
                            variant.canonical_question_id = survivor.canonical.id

                audit = {
                    "id": new_id("mrg"),
                    "survivor_id": survivor.canonical.id,
                    "merged_id": merged.canonical.id,
                    "reason": reason,
                    "reversible": True,
                    "payload": {
                        "fuzzy_score": score,
                        "merged_question": merged.canonical.model_dump(mode="json"),
                        "survivor_question": survivor.canonical.model_dump(mode="json"),
                        "reassigned_variant_ids": reassigned,
                        "merged_wordings": list(merged.wordings),
                        "merged_kinds": sorted(k.value for k in merged.kinds),
                    },
                }
                audits.append(audit)

                survivor.kinds |= merged.kinds
                survivor.variant_ids.extend(merged.variant_ids)
                survivor.wordings.extend(merged.wordings)
                # Clear merged cluster.
                merged.wordings.clear()
                merged.variant_ids.clear()
                merged.kinds.clear()
                changed = True
                break
            if changed:
                break

    # Exact-hash merges already happen at insert time; also emit audits for those
    # would require tracking — insert-time exact hits do not create separate
    # clusters, so no audit is needed beyond fuzzy. Callers that need exact
    # reverse can use variant normalised_hash groups.
    return audits


def _cluster_is_topic(cluster: _Cluster) -> bool:
    has_question = (
        ExtractionClass.EXACT_QUESTION in cluster.kinds
        or ExtractionClass.PARAPHRASED_QUESTION in cluster.kinds
    )
    has_topic = ExtractionClass.TOPIC_SIGNAL in cluster.kinds
    if has_topic and not has_question:
        return True
    return False


def reverse_merge(
    result: CanonicalisationResult,
    audit: dict[str, Any],
) -> CanonicalisationResult:
    """Restore a merged canonical question from a reversible merge audit entry."""
    if not audit.get("reversible"):
        raise ValueError("merge audit is not reversible")
    payload = audit.get("payload") or {}
    merged_data = payload.get("merged_question")
    if not merged_data:
        raise ValueError("merge audit missing merged_question payload")

    restored = CanonicalQuestion.model_validate(merged_data)
    # Avoid duplicate if already present.
    if any(q.id == restored.id for q in result.questions):
        return result

    survivor_id = audit["survivor_id"]
    reassigned = list(payload.get("reassigned_variant_ids") or [])
    for variant in result.variants:
        if variant.id in reassigned:
            variant.canonical_question_id = restored.id

    result.questions.append(restored)
    result.merge_audits = [a for a in result.merge_audits if a.get("id") != audit.get("id")]
    _ = survivor_id
    return result
