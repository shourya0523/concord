"""Text normalisation helpers for exact-hash deduplication."""

from __future__ import annotations

import hashlib
import re
import string

_WHITESPACE_RE = re.compile(r"\s+")
# Light punctuation strip: keep alphanumerics, spaces, and finance-ish markers.
_LIGHT_PUNCT_TABLE = str.maketrans("", "", string.punctuation.replace("%", "").replace("$", ""))


def clean_whitespace(text: str) -> str:
    """Collapse internal whitespace and trim ends."""
    return _WHITESPACE_RE.sub(" ", (text or "").strip())


def strip_punctuation_light(text: str) -> str:
    """Remove common punctuation while preserving % and $."""
    cleaned = (text or "").translate(_LIGHT_PUNCT_TABLE)
    return clean_whitespace(cleaned)


def normalise_for_hash(text: str) -> str:
    """Lowercase, collapse whitespace, and lightly strip punctuation for hashing."""
    return strip_punctuation_light(clean_whitespace(text).lower())


def normalised_hash(text: str) -> str:
    """Return sha256 hex digest of the normalised form of ``text``."""
    normalised = normalise_for_hash(text)
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()
