"""Parse licensed guide PDFs into ExtractedRecord Q&A pairs."""

from __future__ import annotations

import hashlib
import re
from typing import Any

PARSER_VERSION = "guide-pdf-importer-v1"

# Numbered question at line start: "1. Walk me through..."
_NUMBERED_Q_RE = re.compile(
    r"(?:^|\n)\s*(\d{1,3})\.\s+",
    re.MULTILINE,
)
# Section headers (BIWS / M&I)
_SECTION_RE = re.compile(
    r"(?:^|\n)\s*([A-Z][A-Za-z0-9\s/&–\-]+(?:Questions?|Interview|Overview|Guide)[^\n]{0,80})\s*(?:\n|$)",
    re.MULTILINE,
)
_HEADER_FOOTER_PATTERNS = [
    re.compile(r"Access the Financial Modeling Course.*", re.I),
    re.compile(r"Access the Full IB Interview Guide.*", re.I),
    re.compile(r"https?://(?:www\.)?(?:breakingintowallstreet|mergersandinquisitions)\.com\s*", re.I),
    re.compile(r"\d+\s+of\s+\d+\s*", re.I),
    re.compile(r"Return to Top\.?\s*", re.I),
    re.compile(r"Copyright\s+\d{4}.*", re.I),
    re.compile(r"Notice of Rights.*", re.I),
    re.compile(r"No part of this book.*", re.I),
    re.compile(r"Table of Contents:.*", re.I),
]


def _normalise_ws(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clean_guide_text(raw: str) -> str:
    """Strip recurring PDF headers/footers and boilerplate."""
    text = _normalise_ws(raw)
    for pat in _HEADER_FOOTER_PATTERNS:
        text = pat.sub("", text)
    # Drop TOC-style dot leaders
    text = re.sub(r"\.{4,}", " ", text)
    return _normalise_ws(text)


def _infer_topic(section: str | None, question: str) -> str | None:
    blob = f"{section or ''} {question}".lower()
    rules: list[tuple[str, str]] = [
        ("accounting", "acct"),
        ("valuation", "valuation"),
        ("lbo", "lbo"),
        ("merger", "ma"),
        ("m&a", "ma"),
        ("dcf", "dcf"),
        ("debt", "debt"),
        ("equity", "equity"),
        ("behavior", "beh"),
        ("behaviour", "beh"),
        ("fit", "beh"),
        ("market", "markets"),
        ("brain teaser", "brainteaser"),
        ("resume", "beh"),
        ("deal", "ma"),
    ]
    for needle, topic in rules:
        if needle in blob:
            return topic
    return None


def _split_question_answer(block: str) -> tuple[str, str] | None:
    """Split a numbered block into question + answer body."""
    block = block.strip()
    if len(block) < 15:
        return None
    # Remove leading number prefix if still present
    block = re.sub(r"^\d{1,3}\.\s+", "", block).strip()
    if not block:
        return None

    # Question usually ends at first '?'
    q_end = block.find("?")
    if q_end == -1:
        # Some items are imperatives without '?'
        first_para = block.split("\n\n")[0].strip()
        if len(first_para) > 200:
            return None
        question = first_para
        answer = block[len(first_para) :].strip()
    else:
        question = block[: q_end + 1].strip()
        answer = block[q_end + 1 :].strip()

    question = re.sub(r"\s+", " ", question).strip()
    answer = _normalise_ws(answer)

    if len(question) < 10 or not answer or len(answer) < 20:
        return None
    if question.lower().startswith("http"):
        return None
    return question, answer


def parse_guide_qa_pairs(
    text: str,
    *,
    source_id: str,
    section_hint: str | None = None,
) -> list[dict[str, Any]]:
    """Return list of {question, answer, number, section, topic} dicts."""
    cleaned = clean_guide_text(text)
    if not cleaned:
        return []

    # Track sections for topic inference
    current_section = section_hint
    pairs: list[dict[str, Any]] = []

    # Split on numbered questions
    parts = _NUMBERED_Q_RE.split(cleaned)
    # parts: [preamble, num1, block1, num2, block2, ...]
    if len(parts) < 3:
        return []

    i = 1
    while i + 1 < len(parts):
        number = parts[i].strip()
        block = parts[i + 1]
        i += 2

        # Update section if block starts with a header-like line
        sec_match = _SECTION_RE.search(block[:200])
        if sec_match:
            current_section = sec_match.group(1).strip()

        split = _split_question_answer(f"{number}. {block}")
        if not split:
            continue
        question, answer = split
        topic = _infer_topic(current_section, question)
        pairs.append(
            {
                "number": int(number) if number.isdigit() else None,
                "question": question,
                "answer": answer,
                "section": current_section,
                "topic": topic,
                "source_id": source_id,
            }
        )
    return pairs


def stable_pair_id(source_id: str, question: str) -> str:
    """Deterministic id: guide_{source}_{hash}."""
    norm = re.sub(r"\s+", " ", question.strip().lower())
    digest = hashlib.sha256(f"{source_id}|{norm}".encode()).hexdigest()[:16]
    return f"guide_{source_id}_{digest}"
