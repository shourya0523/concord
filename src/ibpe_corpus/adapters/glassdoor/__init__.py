"""Glassdoor interview-question adapter (fixture / session / browser)."""

from __future__ import annotations

from ibpe_corpus.adapters.glassdoor.adapter import GlassdoorAdapter
from ibpe_corpus.adapters.glassdoor.browser_fetch import (
    BrowserGlassdoorFetcher,
    choose_fetcher,
)
from ibpe_corpus.adapters.glassdoor.fetch import GlassdoorFetcher
from ibpe_corpus.adapters.glassdoor.parse import parse_html
from ibpe_corpus.adapters.glassdoor.question_bank import import_question_bank
from ibpe_corpus.adapters.glassdoor.session import (
    credentials_available,
    has_usable_session,
)

__all__ = [
    "BrowserGlassdoorFetcher",
    "GlassdoorAdapter",
    "GlassdoorFetcher",
    "choose_fetcher",
    "credentials_available",
    "has_usable_session",
    "import_question_bank",
    "parse_html",
]
