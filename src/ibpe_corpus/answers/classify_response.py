"""Classify Glassdoor response / comment text into ResponseType."""

from __future__ import annotations

import re

from ibpe_corpus.schemas.models import ResponseType

# Heuristic keyword banks — deterministic, no LLM.
_SPAM_PATTERNS = (
    re.compile(r"^\s*(bump+|lol+|lmao+|nice|cool|same|this|^\.+)\s*$", re.I),
    re.compile(r"(buy followers|crypto airdrop|click here|bit\.ly|t\.me/)", re.I),
    re.compile(r"^\s*https?://\S+\s*$", re.I),
)

_CLARIFICATION_PATTERNS = (
    re.compile(
        r"\b(did you mean|which (office|team|round)|can you clarify|"
        r"what (level|year)|more context|could you expand)\b",
        re.I,
    ),
    re.compile(r"^\s*(what|which|when|where|who|how)\b.+\?\s*$", re.I),
)

_CANDIDATE_PATTERNS = (
    re.compile(
        r"\b(i (said|answered|told|gave|walked|explained|interviewed for)|"
        r"my answer|when i interviewed|they asked me)\b",
        re.I,
    ),
)

_COMMUNITY_ANSWER_PATTERNS = (
    re.compile(
        r"\b(the answer is|correct approach|you (should|would|can) (say|walk)|"
        r"walk them through|formula|enterprise value|wacc|dcf|lbo|moic|irr|"
        r"three statements|3[- ]statements|accretion|dilution)\b",
        re.I,
    ),
    re.compile(r"\b(step[- ]by[- ]step|model answer|standard answer)\b", re.I),
)

_DISCUSSION_PATTERNS = (
    re.compile(
        r"\b(process (was|took)|super day|hirevue|behavioural|behavioral|"
        r"culture fit|office vibe|work[- ]life|team dinner|case interview "
        r"format)\b",
        re.I,
    ),
    re.compile(r"\b(i got (an )?offer|rejected|ghosted|timeline)\b", re.I),
)

_MIN_ANSWER_LEN = 40


def classify_response(text: str, *, metadata: dict | None = None) -> tuple[ResponseType, float]:
    """Classify free-text Glassdoor response content.

    Returns ``(ResponseType, confidence)``. Metadata may include hints such as
    ``is_author`` / ``helpful_votes`` from the scraper, but classification is
    primarily text-driven.
    """
    raw = (text or "").strip()
    meta = metadata or {}

    if not raw or len(raw) < 3:
        return ResponseType.SPAM_OR_IRRELEVANT, 0.95

    for pat in _SPAM_PATTERNS:
        if pat.search(raw):
            return ResponseType.SPAM_OR_IRRELEVANT, 0.9

    # Very short non-technical chatter
    if len(raw) < 15 and not any(ch.isdigit() for ch in raw):
        return ResponseType.SPAM_OR_IRRELEVANT, 0.75

    for pat in _CLARIFICATION_PATTERNS:
        if pat.search(raw):
            return ResponseType.CLARIFICATION, 0.8

    candidate_hit = any(p.search(raw) for p in _CANDIDATE_PATTERNS)
    community_hit = any(p.search(raw) for p in _COMMUNITY_ANSWER_PATTERNS)
    discussion_hit = any(p.search(raw) for p in _DISCUSSION_PATTERNS)

    if candidate_hit and not community_hit:
        return ResponseType.CANDIDATE_ANSWER, 0.75
    if candidate_hit and community_hit:
        # First-person but substantive technical content → candidate attempt
        return ResponseType.CANDIDATE_ANSWER, 0.7

    if community_hit and len(raw) >= _MIN_ANSWER_LEN:
        conf = 0.85
        if int(meta.get("helpful_votes") or 0) > 0:
            conf = min(0.95, conf + 0.05)
        return ResponseType.COMMUNITY_ANSWER, conf

    if discussion_hit and not community_hit:
        return ResponseType.DISCUSSION_COMMENT, 0.7

    if len(raw) >= _MIN_ANSWER_LEN and _looks_technical(raw):
        return ResponseType.COMMUNITY_ANSWER, 0.55

    if discussion_hit:
        return ResponseType.DISCUSSION_COMMENT, 0.55

    return ResponseType.UNKNOWN, 0.4


def _looks_technical(text: str) -> bool:
    tokens = (
        "ebitda",
        "equity",
        "debt",
        "valuation",
        "discount",
        "cash flow",
        "balance sheet",
        "income statement",
        "multiple",
        " synerg",
        "capex",
        "nwc",
        "fcff",
        "fcfe",
    )
    lowered = text.lower()
    return sum(1 for t in tokens if t in lowered) >= 2
