"""Publish gates for teaching Q/A — reject placeholders and non-teaching rows."""

from __future__ import annotations

import re
from typing import Any, Iterable, Sequence

from ibpe_corpus.schemas.models import Answer, CanonicalQuestion, ExtractionClass

# BFF fallback rows look like: "[Interview process] Investment Banking Analyst"
_INTERVIEW_PROCESS_RE = re.compile(
    r"^\s*\[?\s*interview\s+process\s*\]?\s*",
    re.IGNORECASE,
)
_BRACKET_PROCESS_RE = re.compile(
    r"^\s*\[\s*interview\s+process\s*\]",
    re.IGNORECASE,
)


def is_interview_process_placeholder(text: str | None) -> bool:
    """True when text is a synthetic BFF/process placeholder, not a real question."""
    raw = (text or "").strip()
    if not raw:
        return True
    if _BRACKET_PROCESS_RE.search(raw):
        return True
    if _INTERVIEW_PROCESS_RE.match(raw):
        remainder = _INTERVIEW_PROCESS_RE.sub("", raw).strip(" :-—–")
        if len(remainder) < 80 and "?" not in remainder:
            return True
    lowered = raw.lower()
    if lowered in {"interview process", "[interview process]", "n/a", "na", "tbd"}:
        return True
    return False


def is_teaching_record(meta: dict[str, Any] | None) -> bool:
    """Teaching truth comes from GitHub / static seed — not Glassdoor bank."""
    meta = meta or {}
    role = str(meta.get("product_role") or "").lower()
    if role == "firm_signal":
        return False
    if role == "teaching_qa":
        return True
    provenance = str(meta.get("contract_provenance") or meta.get("provenance") or "").lower()
    if provenance in {"glassdoor_occurrence", "glassdoor_question_bank"}:
        return False
    family = str(meta.get("source_family") or "").lower()
    if family in {"glassdoor_question_bank", "glassdoor"}:
        return False
    if meta.get("not_glassdoor") is True:
        return True
    if family in {"github", "static"}:
        return True
    return False


def filter_extracted_for_publish(
    records: Sequence[Any],
) -> tuple[list[Any], list[dict[str, Any]]]:
    """Drop placeholders before canonical/publish.

    Returns ``(kept, rejected_audit_rows)``.
    """
    kept: list[Any] = []
    rejected: list[dict[str, Any]] = []
    for rec in records:
        text = getattr(rec, "exact_source_text", None) or ""
        rt = getattr(rec, "record_type", None)
        rt_val = rt.value if isinstance(rt, ExtractionClass) else str(rt or "")
        if is_interview_process_placeholder(text):
            rejected.append(
                {
                    "reason": "interview_process_placeholder",
                    "record_type": rt_val,
                    "text_preview": text[:160],
                    "record_id": getattr(rec, "id", None),
                }
            )
            continue
        kept.append(rec)
    return kept, rejected


def is_publishable_canonical(q: CanonicalQuestion) -> bool:
    """Canonical rows eligible for production teaching publish."""
    if is_interview_process_placeholder(q.canonical_wording):
        return False
    if q.review_state == "topic_signal":
        return False
    if q.review_state in {"rejected", "placeholder"}:
        return False
    return True


def filter_publishable_questions(
    questions: Sequence[CanonicalQuestion],
) -> tuple[list[CanonicalQuestion], list[CanonicalQuestion]]:
    """Split teaching publish set vs withheld (signals / placeholders)."""
    publishable: list[CanonicalQuestion] = []
    withheld: list[CanonicalQuestion] = []
    for q in questions:
        if is_publishable_canonical(q):
            publishable.append(q)
        else:
            withheld.append(q)
    return publishable, withheld


def filter_publishable_answers(
    answers: Sequence[Answer],
    publishable_question_ids: Iterable[str],
) -> tuple[list[Answer], list[Answer]]:
    """Keep answers for publishable questions; drop placeholder answer bodies."""
    allowed = set(publishable_question_ids)
    kept: list[Answer] = []
    withheld: list[Answer] = []
    for ans in answers:
        if ans.canonical_question_id not in allowed:
            withheld.append(ans)
            continue
        if is_interview_process_placeholder(ans.concise_answer) or is_interview_process_placeholder(
            ans.expanded_explanation
        ):
            withheld.append(ans)
            continue
        kept.append(ans)
    return kept, withheld
