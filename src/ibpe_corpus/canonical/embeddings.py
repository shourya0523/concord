"""Lightweight bag-of-words / hashing-trick embeddings (no ML dependencies)."""

from __future__ import annotations

import hashlib
import math
import re
from collections.abc import Iterable, Sequence

from ibpe_corpus.canonical.normalise import normalise_for_hash

_TOKEN_RE = re.compile(r"[a-z0-9%$]+")

DEFAULT_DIM = 256


def _tokens(text: str) -> list[str]:
    return _TOKEN_RE.findall(normalise_for_hash(text))


def _stable_token_hash(token: str) -> int:
    """Process-stable 64-bit hash (avoids PYTHONHASHSEED nondeterminism)."""
    digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big", signed=False)


def hashing_embed(text: str, dim: int = DEFAULT_DIM) -> list[float]:
    """Embed ``text`` with the hashing trick into a unit-length float vector."""
    if dim <= 0:
        raise ValueError("dim must be positive")
    vec = [0.0] * dim
    tokens = _tokens(text)
    if not tokens:
        return vec
    for token in tokens:
        # Signed hashing trick: index from hash, sign from secondary bit.
        h = _stable_token_hash(token)
        idx = h % dim
        sign = 1.0 if (h & 1) == 0 else -1.0
        vec[idx] += sign
    # L2 normalise for cosine convenience.
    norm = math.sqrt(sum(v * v for v in vec))
    if norm == 0.0:
        return vec
    return [v / norm for v in vec]


def sparse_hashing_embed(text: str, dim: int = DEFAULT_DIM) -> dict[int, float]:
    """Sparse form of :func:`hashing_embed` — same values, non-zero dims only."""
    vec: dict[int, float] = {}
    for token in _tokens(text):
        h = _stable_token_hash(token)
        idx = h % dim
        vec[idx] = vec.get(idx, 0.0) + (1.0 if (h & 1) == 0 else -1.0)
    norm = math.sqrt(sum(v * v for v in vec.values()))
    if norm == 0.0:
        return {}
    return {k: v / norm for k, v in vec.items() if v}


def sparse_cosine(a: dict[int, float], b: dict[int, float]) -> float:
    """Cosine of two unit-normalised sparse vectors (dot product)."""
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(k, 0.0) for k, v in a.items())


def cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    """Cosine similarity between two equal-length vectors."""
    if len(a) != len(b):
        raise ValueError("vectors must have equal length")
    if not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def nearest_neighbours(
    query: str | Sequence[float],
    corpus: Iterable[tuple[str, str | Sequence[float]]],
    *,
    k: int = 10,
    dim: int = DEFAULT_DIM,
) -> list[tuple[str, float]]:
    """Return top-``k`` ``(id, score)`` neighbours by cosine similarity.

    ``corpus`` items are ``(id, text_or_embedding)``.
    """
    query_vec = (
        list(query) if not isinstance(query, str) else hashing_embed(query, dim=dim)
    )
    scored: list[tuple[str, float]] = []
    for item_id, value in corpus:
        vec = list(value) if not isinstance(value, str) else hashing_embed(value, dim=dim)
        scored.append((item_id, cosine_similarity(query_vec, vec)))
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[: max(0, k)]
