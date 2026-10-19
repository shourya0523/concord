"""Lexical RAG retrieval over supplemental corpus exports."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_RAG_EXPORT = ROOT / "exports" / "rag_context.jsonl"

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> set[str]:
    return set(_TOKEN_RE.findall(text.lower()))


def load_rag_context(path: Path | str | None = None) -> list[dict[str, Any]]:
    """Load supplemental RAG rows from exports/rag_context.jsonl."""
    p = Path(path) if path else DEFAULT_RAG_EXPORT
    if not p.is_file():
        return []
    rows: list[dict[str, Any]] = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def retrieve_rag_chunks(
    query: str,
    *,
    corpus: list[dict[str, Any]] | None = None,
    path: Path | str | None = None,
    top_k: int = 5,
    min_score: float = 0.05,
) -> list[dict[str, Any]]:
    """Token-overlap retrieval for offline enrichment (no vector DB required)."""
    rows = corpus if corpus is not None else load_rag_context(path)
    if not rows or not query.strip():
        return []

    q_tokens = _tokens(query)
    if not q_tokens:
        return []

    scored: list[tuple[float, dict[str, Any]]] = []
    for row in rows:
        text = str(row.get("text") or "")
        if not text.strip():
            continue
        t_tokens = _tokens(text)
        if not t_tokens:
            continue
        overlap = len(q_tokens & t_tokens) / max(1, len(q_tokens))
        if overlap < min_score:
            continue
        scored.append(
            (
                overlap,
                {
                    "id": row.get("id"),
                    "text": text[:1200],
                    "provenance": row.get("provenance"),
                    "score": round(overlap, 4),
                    "source_family": row.get("source_family"),
                },
            )
        )

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:top_k]]


def require_guide_anchor(chunks: list[dict[str, Any]]) -> bool:
    """True when retrieval includes at least one non-Glassdoor chunk."""
    if not chunks:
        return False
    return any(c.get("provenance") != "glassdoor_occurrence" for c in chunks)
