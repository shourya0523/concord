"""Rule-based PE role relevance classifier."""

from __future__ import annotations

import re
from typing import Any

from ibpe_corpus.pe.taxonomy import load_taxonomy
from ibpe_corpus.schemas.models import PERelevance

# Evaluation order: exclusions / ops first, then portfolio, advisory, allocator,
# adjacent, core. First strong match wins in classify_role().
_PE_CONTEXT = re.compile(
    r"\b("
    r"private\s+equity|pe\b|buyout|lbo|growth\s+equity|"
    r"private\s+credit|direct\s+lending|secondar(?:y|ies)|"
    r"infrastructure|co-?invest|fund\s+of\s+funds|fof|"
    r"special\s+situations|distressed|repe|real\s+estate\s+private\s+equity"
    r")\b",
    re.IGNORECASE,
)

_CORE_TITLE = re.compile(
    r"\b("
    r"private\s+equity\s+(analyst|associate|senior\s+associate|principal|"
    r"vice\s+president|vp|intern|director|managing\s+director)|"
    r"pe\s+(analyst|associate|senior\s+associate|principal|vice\s+president|"
    r"vp|intern|director)|"
    r"(pre|post)[-\s]?mba\s+(associate|analyst)|"
    r"(buyout|direct\s+investment[s]?)\s+(analyst|associate|professional)|"
    r"investment\s+(analyst|associate|professional)\b.*\b(private\s+equity|pe|buyout)\b|"
    r"\b(private\s+equity|pe|buyout)\b.*\binvestment\s+(analyst|associate|professional)\b|"
    r"off[-\s]?cycle\s+(private\s+equity|pe)\b|"
    r"(private\s+equity|pe)\s+summer\s+analyst|"
    r"summer\s+analyst\s+(private\s+equity|pe)"
    r")\b",
    re.IGNORECASE,
)


def _flatten_keywords(taxonomy: dict[str, Any]) -> dict[PERelevance, list[str]]:
    raw = taxonomy.get("classifier_keywords") or {}
    out: dict[PERelevance, list[str]] = {}
    for label in PERelevance:
        block = raw.get(label.value) or {}
        positives = [p.lower() for p in block.get("positive") or [] if p]
        # Also harvest aliases from structured sections.
        positives.extend(_aliases_for_label(taxonomy, label))
        # Longest first for greedy substring matching.
        out[label] = sorted(set(positives), key=len, reverse=True)
    return out


def _aliases_for_label(taxonomy: dict[str, Any], label: PERelevance) -> list[str]:
    aliases: list[str] = []
    target = label.value
    for section in ("core_investing_roles", "strategy_roles", "exclusion_classes"):
        for item in taxonomy.get(section, []) or []:
            if item.get("relevance") != target:
                continue
            aliases.extend(a.lower() for a in (item.get("aliases") or []) if a)
            if item.get("label"):
                aliases.append(str(item["label"]).lower())
    return aliases


def _contains_phrase(text: str, phrase: str) -> bool:
    if " " in phrase or "-" in phrase:
        return phrase in text
    return bool(re.search(rf"\b{re.escape(phrase)}\b", text))


def _score_label(text: str, phrases: list[str]) -> tuple[int, str | None]:
    for phrase in phrases:
        if _contains_phrase(text, phrase):
            return len(phrase), phrase
    return 0, None


def classify_role(title: str, context: str = "") -> PERelevance:
    """
    Classify a job / interview role title into a ``PERelevance`` bucket.

    Uses keyword rules from ``config/private_equity_taxonomy.yml`` plus a small
    set of structural heuristics. ``context`` may include employer, interview
    process text, or question snippets that supply PE cues.
    """
    taxonomy = load_taxonomy()
    keywords = _flatten_keywords(taxonomy)
    blob = f"{title} {context}".strip().lower()
    title_l = (title or "").strip().lower()

    if not title_l and not context.strip():
        return PERelevance.NOT_PE

    # Explicit recruiter / vendor / legal / wealth exclusions on title first.
    for phrase in keywords[PERelevance.NOT_PE]:
        if _contains_phrase(title_l, phrase) or (
            _contains_phrase(blob, phrase)
            and any(
                t in title_l
                for t in ("recruit", "search", "lawyer", "counsel", "wealth", "sales")
            )
        ):
            return PERelevance.NOT_PE

    # Fund operations (accountant, IR, compliance, placement).
    score, _ = _score_label(blob, keywords[PERelevance.FUND_OPERATIONS])
    if score:
        # Recruiter phrases already handled; fund accountant is fund_ops even with PE.
        return PERelevance.FUND_OPERATIONS

    # Portfolio operations / value creation.
    score, hit = _score_label(blob, keywords[PERelevance.PORTFOLIO_OPERATIONS])
    if score and (
        "portfolio" in blob
        or "value creation" in blob
        or "operating partner" in blob
        or hit
    ):
        return PERelevance.PORTFOLIO_OPERATIONS

    # PE advisory (sponsors coverage, TS/QoE, consulting serving PE).
    score, _ = _score_label(blob, keywords[PERelevance.PE_ADVISORY])
    if score:
        return PERelevance.PE_ADVISORY

    # Allocator / FoF / pension.
    score, _ = _score_label(blob, keywords[PERelevance.ALLOCATOR_OR_FUND_SELECTION])
    if score:
        return PERelevance.ALLOCATOR_OR_FUND_SELECTION

    # Adjacent investing strategies.
    score, _ = _score_label(blob, keywords[PERelevance.ADJACENT_PE_INVESTING])
    if score:
        return PERelevance.ADJACENT_PE_INVESTING

    # Strong core PE title patterns.
    if _CORE_TITLE.search(title_l) or _CORE_TITLE.search(blob):
        return PERelevance.CORE_PE_INVESTING

    score, hit = _score_label(blob, keywords[PERelevance.CORE_PE_INVESTING])
    if score:
        # Short generic titles like "Associate" need PE context.
        generic = bool(
            re.fullmatch(
                r"(associate|analyst|senior associate|principal|vice president|vp|"
                r"intern|summer analyst|investment associate|investment analyst)",
                title_l,
            )
        )
        if generic and not _PE_CONTEXT.search(blob):
            return PERelevance.NOT_PE
        return PERelevance.CORE_PE_INVESTING

    # Title is PE-ish but only via context cues + investing seniority word.
    if _PE_CONTEXT.search(blob) and re.search(
        r"\b(associate|analyst|principal|vice president|vp|intern|"
        r"investment professional|managing director)\b",
        title_l,
    ):
        return PERelevance.CORE_PE_INVESTING

    return PERelevance.NOT_PE


def classify_records(
    records: list[dict[str, Any]],
    *,
    title_key: str = "role",
    context_key: str = "context",
) -> list[dict[str, Any]]:
    """Annotate dict records with ``pe_relevance``."""
    annotated: list[dict[str, Any]] = []
    for record in records:
        item = dict(record)
        title = str(item.get(title_key) or item.get("title") or "")
        context = str(item.get(context_key) or "")
        if not context:
            bits = [
                str(item.get(k) or "")
                for k in ("employer", "office", "exact_source_text", "process")
            ]
            context = " ".join(b for b in bits if b)
        item["pe_relevance"] = classify_role(title, context).value
        annotated.append(item)
    return annotated
