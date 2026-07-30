"""Text normalisation helpers for answer matching and hashing."""

from __future__ import annotations

import hashlib
import re
import unicodedata

_WS_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[^\w\s]", re.UNICODE)


def normalise_text(text: str) -> str:
    """Lowercase, strip accents/punctuation, collapse whitespace."""
    if not text:
        return ""
    folded = unicodedata.normalize("NFKD", text)
    ascii_ish = "".join(ch for ch in folded if not unicodedata.combining(ch))
    lowered = ascii_ish.lower().strip()
    no_punct = _PUNCT_RE.sub(" ", lowered)
    return _WS_RE.sub(" ", no_punct).strip()


def normalised_hash(text: str) -> str:
    """SHA-256 of normalised text (stable across trivial wording noise)."""
    payload = normalise_text(text).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()
