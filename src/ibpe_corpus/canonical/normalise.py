"""Text normalisation helpers for exact-hash deduplication."""

from __future__ import annotations

import hashlib
import re
import string
from functools import lru_cache

_WHITESPACE_RE = re.compile(r"\s+")
# Light punctuation strip: keep alphanumerics, spaces, and finance-ish markers.
_LIGHT_PUNCT_TABLE = str.maketrans("", "", string.punctuation.replace("%", "").replace("$", ""))

# Source numbering such as "Question 12:", "Question 3.", "Q7)", "Question #4 -".
# A delimiter after the number is required so "Q3 earnings" is left alone.
_QUESTION_PREFIX_RE = re.compile(
    r"^\s*(?:question|q)\s*(?:#|no\.?)?\s*\d{1,4}\s*[:.)\]\-–—]\s*",
    re.IGNORECASE,
)


def clean_whitespace(text: str) -> str:
    """Collapse internal whitespace and trim ends."""
    return _WHITESPACE_RE.sub(" ", (text or "").strip())


def strip_question_prefix(text: str) -> str:
    """Remove source numbering prefixes like ``Question 12:`` from a wording.

    Applied before hashing and export so the same question imported with and
    without numbering dedupes, and learners never see ``Question N:``.
    Never returns an empty string: if stripping would empty the text, the
    original (whitespace-cleaned) text is kept.
    """
    cleaned = clean_whitespace(text)
    stripped = cleaned
    # Some sources double-number ("Question 3: Q3. …"); strip at most twice.
    for _ in range(2):
        nxt = _QUESTION_PREFIX_RE.sub("", stripped, count=1)
        if nxt == stripped:
            break
        stripped = nxt.strip()
    return stripped or cleaned


def has_question_prefix(text: str) -> bool:
    """True when ``text`` still starts with a ``Question N:`` style prefix."""
    return bool(_QUESTION_PREFIX_RE.match(text or ""))


def strip_punctuation_light(text: str) -> str:
    """Remove common punctuation while preserving % and $."""
    cleaned = (text or "").translate(_LIGHT_PUNCT_TABLE)
    return clean_whitespace(cleaned)


@lru_cache(maxsize=131072)
def normalise_for_hash(text: str) -> str:
    """Strip numbering, lowercase, collapse whitespace, light punctuation strip.

    Memoised: canonicalisation compares every wording against every cluster, so
    the same strings are normalised millions of times per run.
    """
    return strip_punctuation_light(strip_question_prefix(text).lower())


def normalised_hash(text: str) -> str:
    """Return sha256 hex digest of the normalised form of ``text``."""
    normalised = normalise_for_hash(text)
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()
