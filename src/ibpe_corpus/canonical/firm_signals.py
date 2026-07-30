"""Join Glassdoor bank / occurrence rows onto teaching canonicals as firm signals.

Glassdoor never supplies teaching answers — only directional firm preferences
(employer × role × topic heat via occurrences).
"""

from __future__ import annotations

from typing import Any, Sequence

from rapidfuzz import fuzz

from ibpe_corpus.canonical.normalise import normalise_for_hash, normalised_hash
from ibpe_corpus.canonical.publish_gate import is_interview_process_placeholder
from ibpe_corpus.schemas.models import (
    CanonicalQuestion,
    ExtractionClass,
    ExtractedRecord,
    InterviewOccurrence,
    QuestionVariant,
    new_id,
)

DEFAULT_JOIN_THRESHOLD = 88.0


def _kind(record: ExtractedRecord) -> ExtractionClass | None:
    rt = record.record_type
    if isinstance(rt, ExtractionClass):
        return rt
    try:
        return ExtractionClass(rt)
    except ValueError:
        return None


def join_firm_signals(
    teaching_questions: Sequence[CanonicalQuestion],
    teaching_variants: Sequence[QuestionVariant],
    signal_records: Sequence[ExtractedRecord],
    *,
    fuzzy_threshold: float = DEFAULT_JOIN_THRESHOLD,
) -> tuple[list[InterviewOccurrence], list[dict[str, Any]]]:
    """Attach bank/signal rows to nearest teaching canonical when wording matches.

    Unmatched signals remain as topic-signal clusters from ``canonicalise``; this
    step only creates ``InterviewOccurrence`` joins and a reversible audit trail.
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

    occurrences: list[InterviewOccurrence] = []
    audits: list[dict[str, Any]] = []
    signal_kinds = {
        ExtractionClass.TOPIC_SIGNAL,
        ExtractionClass.EXACT_QUESTION,
        ExtractionClass.PARAPHRASED_QUESTION,
    }

    for rec in signal_records:
        kind = _kind(rec)
        if kind not in signal_kinds:
            continue
        text = (rec.exact_source_text or "").strip()
        if not text or is_interview_process_placeholder(text):
            continue
        meta = dict(rec.extracted_metadata or {})
        product_role = str(meta.get("product_role") or "").lower()
        family = str(meta.get("source_family") or "").lower()
        if product_role not in {"firm_signal", ""} and family not in {
            "glassdoor_question_bank",
            "glassdoor",
        }:
            if meta.get("contract_provenance") != "glassdoor_occurrence":
                continue

        n_hash = normalised_hash(text)
        cq_id = hash_to_cq.get(n_hash)
        score = 100.0
        reason = "exact_hash"
        if cq_id is None:
            norm = normalise_for_hash(text)
            best_score = -1.0
            best_id: str | None = None
            for other_norm, other_id, _ in wording_to_cq:
                s = float(fuzz.token_set_ratio(norm, other_norm))
                if s >= fuzzy_threshold and s > best_score:
                    best_score = s
                    best_id = other_id
            if best_id is None:
                continue
            cq_id = best_id
            score = best_score
            reason = "fuzzy_match"

        variant_id = next(
            (v.id for v in teaching_variants if v.canonical_question_id == cq_id),
            None,
        )
        if variant_id is None:
            continue

        employer = meta.get("employer") or meta.get("company")
        role = meta.get("role") or meta.get("position")
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
            confidence=min(1.0, float(rec.grounding_confidence) * (score / 100.0)),
            detail_url=str(meta["detail_url"]) if meta.get("detail_url") else None,
        )
        occurrences.append(occ)
        audits.append(
            {
                "id": new_id("sig"),
                "survivor_id": cq_id,
                "merged_id": rec.id,
                "reason": f"firm_signal_join:{reason}",
                "reversible": True,
                "payload": {
                    "fuzzy_score": score,
                    "signal_text": text,
                    "employer": occ.employer,
                    "role": occ.role,
                    "occurrence_id": occ.id,
                    "bank_question_id": meta.get("bank_question_id"),
                    "product_role": "firm_signal",
                    "contract_provenance": "glassdoor_occurrence",
                },
            }
        )

    return occurrences, audits
