"""Glassdoor interview-question adapter (fixture-first, block-aware)."""

from __future__ import annotations

from ibpe_corpus.adapters.glassdoor.adapter import GlassdoorAdapter
from ibpe_corpus.adapters.glassdoor.fetch import GlassdoorFetcher
from ibpe_corpus.adapters.glassdoor.parse import parse_html

__all__ = [
    "GlassdoorAdapter",
    "GlassdoorFetcher",
    "parse_html",
]
