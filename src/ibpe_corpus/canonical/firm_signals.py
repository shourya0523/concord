"""Join Glassdoor bank / occurrence rows onto teaching canonicals as firm signals.

Glassdoor never supplies teaching answers — only directional firm preferences
(employer × role × topic heat via occurrences).

Plan P2.7 additions:

* every signal gets a topic (keyword rules v4, mirroring migration 038; an
  optional LLM tagger fills what the rules leave ``untagged``);
* the occurrence → teaching join records ``join_method`` (``exact`` |
  ``fuzzy`` | ``embedding``) and ``join_score`` in [0, 1], mirroring
  ``canonical.question_occurrences`` (migration 044);
* :func:`signal_join_rows` exports one row per signal wording for the publish
  path (``exports/occurrence_joins.jsonl`` → publish-teaching.ts).
"""

from __future__ import annotations

import json
from collections import defaultdict
from typing import Any, Callable, Sequence

from pydantic import BaseModel, Field
from rapidfuzz import fuzz

from ibpe_corpus.canonical.embeddings import sparse_cosine, sparse_hashing_embed
from ibpe_corpus.canonical.normalise import normalise_for_hash, normalised_hash
from ibpe_corpus.canonical.publish_gate import is_interview_process_placeholder
from ibpe_corpus.canonical.taxonomy_rules import TOPIC_SLUGS, UNTAGGED, infer_topic
from ibpe_corpus.schemas.models import (
    CanonicalQuestion,
    ExtractionClass,
    ExtractedRecord,
    InterviewOccurrence,
    QuestionVariant,
    new_id,
)

DEFAULT_JOIN_THRESHOLD = 88.0
EMBEDDING_JOIN_THRESHOLD = 0.82
TOPIC_TAG_PROMPT_VERSION = "signal-topic-v1"

TopicTagger = Callable[[list[str]], list[str | None]]


class SignalTopicBatch(BaseModel):
    """Structured-output contract for prompt ``signal-topic-v1`` (one slug per input)."""

    topics: list[str] = Field(default_factory=list)


def _kind(record: ExtractedRecord) -> ExtractionClass | None:
    rt = record.record_type
    if isinstance(rt, ExtractionClass):
        return rt
    try:
        return ExtractionClass(rt)
    except ValueError:
        return None


_sparse_embed = sparse_hashing_embed
_sparse_cosine = sparse_cosine


class _EmbeddingIndex:
    """Tiny inverted index over sparse hashing embeddings (no numpy needed)."""

    def __init__(self, items: Sequence[tuple[str, str]]) -> None:
        self.vectors: list[tuple[str, dict[int, float]]] = []
        self.postings: dict[int, list[int]] = defaultdict(list)
        for item_id, text in items:
            vec = _sparse_embed(text)
            if not vec:
                continue
            idx = len(self.vectors)
            self.vectors.append((item_id, vec))
            for dim in vec:
                self.postings[dim].append(idx)

    def best(self, text: str) -> tuple[str | None, float]:
        query = _sparse_embed(text)
        if not query:
            return None, 0.0
        candidates: set[int] = set()
        for dim in query:
            candidates.update(self.postings.get(dim, ()))
        best_id, best = None, 0.0
        for idx in candidates:
            item_id, vec = self.vectors[idx]
            score = _sparse_cosine(query, vec)
            if score > best:
                best_id, best = item_id, score
        return best_id, best


def tag_signal_topic(text: str) -> str:
    """Heuristic topic for a signal wording (``untagged`` when no rule fires)."""
    return infer_topic(text)


def _is_signal(rec: ExtractedRecord, meta: dict[str, Any]) -> bool:
    product_role = str(meta.get("product_role") or "").lower()
    family = str(meta.get("source_family") or "").lower()
    if product_role not in {"firm_signal", ""} and family not in {
        "glassdoor_question_bank",
        "glassdoor",
    }:
        if meta.get("contract_provenance") != "glassdoor_occurrence":
            return False
    return True


def join_firm_signals(
    teaching_questions: Sequence[CanonicalQuestion],
    teaching_variants: Sequence[QuestionVariant],
    signal_records: Sequence[ExtractedRecord],
    *,
    fuzzy_threshold: float = DEFAULT_JOIN_THRESHOLD,
    embedding_threshold: float = EMBEDDING_JOIN_THRESHOLD,
    join_rows: list[dict[str, Any]] | None = None,
    topic_tagger: TopicTagger | None = None,
) -> tuple[list[InterviewOccurrence], list[dict[str, Any]]]:
    """Attach bank/signal rows to nearest teaching canonical when wording matches.

    Unmatched signals remain as topic-signal clusters from ``canonicalise``; this
    step creates ``InterviewOccurrence`` joins (with topic, join_score and
    join_method) plus a reversible audit trail. When ``join_rows`` is given it
    is filled with one export row per distinct signal wording.
    """
    hash_to_cq: dict[str, str] = {}
    wording_to_cq: list[tuple[str, str, str]] = []
    cq_by_id = {q.id: q for q in teaching_questions}

    for v in teaching_variants:
        if v.canonical_question_id not in cq_by_id:
            continue
        hash_to_cq[v.normalised_hash] = v.canonical_question_id
        wording_to_cq.append(
            (normalise_for_hash(v.cleaned_wording), v.canonical_question_id, v.cleaned_wording)
        )
    for q in teaching_questions:
        if q.normalised_hash:
            hash_to_cq.setdefault(q.normalised_hash, q.id)
        wording_to_cq.append(
            (normalise_for_hash(q.canonical_wording), q.id, q.canonical_wording)
        )
    first_variant: dict[str, str] = {}
    for v in teaching_variants:
        first_variant.setdefault(v.canonical_question_id, v.id)
    emb_index = _EmbeddingIndex([(cq_id, text) for _, cq_id, text in wording_to_cq])

    occurrences: list[InterviewOccurrence] = []
    audits: list[dict[str, Any]] = []
    signal_kinds = {
        ExtractionClass.TOPIC_SIGNAL,
        ExtractionClass.EXACT_QUESTION,
        ExtractionClass.PARAPHRASED_QUESTION,
    }
    join_cache: dict[str, tuple[str | None, float, str | None]] = {}
    topic_cache: dict[str, str] = {}
    export_by_hash: dict[str, dict[str, Any]] = {}

    candidates: list[tuple[ExtractedRecord, dict[str, Any], str, str]] = []
    for rec in signal_records:
        if _kind(rec) not in signal_kinds:
            continue
        text = (rec.exact_source_text or "").strip()
        if not text or is_interview_process_placeholder(text):
            continue
        meta = dict(rec.extracted_metadata or {})
        if not _is_signal(rec, meta):
            continue
        n_hash = normalised_hash(text)
        candidates.append((rec, meta, text, n_hash))
        if n_hash not in topic_cache:
            topic_cache[n_hash] = tag_signal_topic(text)

    if topic_tagger is not None:
        untagged = [(h, t) for (_, _, t, h) in candidates if topic_cache.get(h) == UNTAGGED]
        seen: dict[str, str] = {}
        for h, t in untagged:
            seen.setdefault(h, t)
        if seen:
            hashes = list(seen)
            try:
                tags = topic_tagger([seen[h] for h in hashes])
            except Exception:  # noqa: BLE001 — tagger failure keeps heuristic tags
                tags = [None] * len(hashes)
            for h, tag in zip(hashes, tags):
                if tag in TOPIC_SLUGS:
                    topic_cache[h] = str(tag)

    for rec, meta, text, n_hash in candidates:
        if n_hash in join_cache:
            cq_id, score, method = join_cache[n_hash]
        else:
            cq_id = hash_to_cq.get(n_hash)
            score, method = (1.0, "exact") if cq_id else (0.0, None)
            if cq_id is None:
                norm = normalise_for_hash(text)
                best_score = -1.0
                best_id: str | None = None
                for other_norm, other_id, _ in wording_to_cq:
                    s = float(fuzz.token_set_ratio(norm, other_norm))
                    if s >= fuzzy_threshold and s > best_score:
                        best_score = s
                        best_id = other_id
                if best_id is not None:
                    cq_id, score, method = best_id, round(best_score / 100.0, 4), "fuzzy"
            if cq_id is None:
                emb_id, emb_score = emb_index.best(text)
                if emb_id is not None and emb_score >= embedding_threshold:
                    cq_id, score, method = emb_id, round(min(1.0, emb_score), 4), "embedding"
            join_cache[n_hash] = (cq_id, score, method)

        topic = topic_cache.get(n_hash, UNTAGGED)
        row = export_by_hash.get(n_hash)
        if row is None:
            row = {
                "signal_hash": n_hash,
                "signal_text": text,
                "topic": topic,
                "topic_method": "rules" if infer_topic(text) == topic else "llm",
                "canonical_question_id": cq_id,
                "join_score": score if cq_id else None,
                "join_method": method,
                "occurrences": 0,
                "employers": [],
            }
            export_by_hash[n_hash] = row
        row["occurrences"] += 1
        employer = meta.get("employer") or meta.get("company")
        role = meta.get("role") or meta.get("position")
        if employer and employer not in row["employers"] and len(row["employers"]) < 10:
            row["employers"].append(str(employer))

        if cq_id is None:
            continue
        variant_id = first_variant.get(cq_id)
        if variant_id is None:
            continue
        if not employer and not role:
            continue

        occ = InterviewOccurrence(
            question_variant_id=variant_id,
            interview_review_id=str(meta.get("bank_question_id") or "") or None,
            employer=str(employer) if employer else None,
            employer_id=str(meta["employer_id"]) if meta.get("employer_id") else None,
            role=str(role) if role else None,
            office=str(meta["office"]) if meta.get("office") else None,
            round=str(meta["round"]) if meta.get("round") else None,
            interview_date=str(meta["interview_date"]) if meta.get("interview_date") else None,
            recruiting_cycle=str(meta["recruiting_cycle"]) if meta.get("recruiting_cycle") else None,
            outcome=str(meta["outcome"]) if meta.get("outcome") else None,
            source_id=rec.source_artefact_id,
            confidence=min(1.0, float(rec.grounding_confidence) * score),
            detail_url=str(meta["detail_url"]) if meta.get("detail_url") else None,
            topic=topic if topic != UNTAGGED else None,
            canonical_question_id=cq_id,
            join_score=score,
            join_method=method,  # type: ignore[arg-type]
        )
        occurrences.append(occ)
        audits.append(
            {
                "id": new_id("sig"),
                "survivor_id": cq_id,
                "merged_id": rec.id,
                "reason": f"firm_signal_join:{'exact_hash' if method == 'exact' else method + '_match'}",
                "reversible": True,
                "payload": {
                    "fuzzy_score": score * 100.0,
                    "join_score": score,
                    "join_method": method,
                    "signal_text": text,
                    "topic": topic,
                    "employer": occ.employer,
                    "role": occ.role,
                    "occurrence_id": occ.id,
                    "bank_question_id": meta.get("bank_question_id"),
                    "product_role": "firm_signal",
                    "contract_provenance": "glassdoor_occurrence",
                },
            }
        )

    if join_rows is not None:
        join_rows.extend(export_by_hash.values())
    return occurrences, audits


def signal_join_summary(rows: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """C3 / C4 style metrics over exported signal rows (weighted by occurrences)."""
    total = sum(int(r.get("occurrences") or 0) for r in rows) or 0
    tagged = sum(int(r.get("occurrences") or 0) for r in rows if r.get("topic") not in {None, UNTAGGED})
    joined = sum(int(r.get("occurrences") or 0) for r in rows if r.get("canonical_question_id"))
    by_method: dict[str, int] = {}
    for r in rows:
        if r.get("join_method"):
            by_method[r["join_method"]] = by_method.get(r["join_method"], 0) + int(r.get("occurrences") or 0)
    return {
        "signal_wordings": len(rows),
        "signal_occurrences": total,
        "topic_tagged_occurrences": tagged,
        "topic_coverage": round(tagged / total, 4) if total else 0.0,
        "joined_occurrences": joined,
        "join_coverage": round(joined / total, 4) if total else 0.0,
        "join_methods": by_method,
    }


SIGNAL_TOPIC_PROMPT = """Classify each IB/PE interview question into exactly one topic slug from:
{slugs}. Use "untagged" if none fits. Return JSON {{"topics": [slug, ...]}} in input order.
QUESTIONS:
{items}
"""


def llm_topic_tagger(call: Callable[[str], dict[str, Any]], *, batch_size: int = 25) -> TopicTagger:
    """Wrap a JSON model call (prompt ``signal-topic-v1``) as a batch topic tagger."""

    def _tag(texts: list[str]) -> list[str | None]:
        out: list[str | None] = []
        for i in range(0, len(texts), batch_size):
            chunk = texts[i : i + batch_size]
            prompt = SIGNAL_TOPIC_PROMPT.format(
                slugs=", ".join(TOPIC_SLUGS),
                items="\n".join(f"{n + 1}. {json.dumps(t)}" for n, t in enumerate(chunk)),
            )
            try:
                payload = call(prompt)
                topics = list(payload.get("topics") or [])
            except Exception:  # noqa: BLE001
                topics = []
            topics = (topics + [None] * len(chunk))[: len(chunk)]
            out.extend(t if t in TOPIC_SLUGS else None for t in topics)
        return out

    return _tag
