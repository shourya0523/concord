"""Glassdoor access-state detection (honest block/CAPTCHA classification)."""

from __future__ import annotations

import re

from ibpe_corpus.schemas.models import AccessState

# Ordered from most specific to least. CAPTCHA beats generic blocked.
_CAPTCHA_PATTERNS = (
    re.compile(r"captcha", re.IGNORECASE),
    re.compile(r"captcha-container", re.IGNORECASE),
    re.compile(r"_cf_chl_opt", re.IGNORECASE),
)

_BLOCK_PATTERNS = (
    re.compile(r"cloudflare", re.IGNORECASE),
    re.compile(r"\brobot\b", re.IGNORECASE),
    re.compile(r"\bblocked\b", re.IGNORECASE),
    re.compile(r"Enable JavaScript and cookies to continue", re.IGNORECASE),
    re.compile(r"data-cf-beacon", re.IGNORECASE),
    re.compile(r'name=["\']robots["\']\s+content=["\']noindex,\s*nofollow', re.IGNORECASE),
)

_PUBLIC_MARKERS = (
    re.compile(r'id=["\']__NEXT_DATA__["\']', re.IGNORECASE),
    re.compile(r'data-test=["\']InterviewQuestionCard["\']', re.IGNORECASE),
    re.compile(r'data-test=["\']QuestionDetail["\']', re.IGNORECASE),
    re.compile(r"InterviewQuestion:", re.IGNORECASE),
)


def detect_access_state(
    status_code: int | None = None,
    html: str | None = None,
) -> AccessState:
    """Classify response access state from HTTP status and/or HTML body.

    Does not attempt circumvention; CAPTCHA/blocked are terminal for expansion.
    """
    code = status_code
    body = html or ""

    if code == 404:
        return AccessState.NOT_FOUND
    if code == 429:
        return AccessState.THROTTLED

    if code is not None and code >= 500:
        return AccessState.UNKNOWN

    captcha_hit = any(p.search(body) for p in _CAPTCHA_PATTERNS)
    block_hit = any(p.search(body) for p in _BLOCK_PATTERNS)

    if code == 403:
        if captcha_hit:
            return AccessState.CAPTCHA
        return AccessState.BLOCKED

    if captcha_hit:
        return AccessState.CAPTCHA
    if block_hit and not any(p.search(body) for p in _PUBLIC_MARKERS):
        return AccessState.BLOCKED

    if code is not None and 200 <= code < 300:
        if any(p.search(body) for p in _PUBLIC_MARKERS) or (
            body and not captcha_hit and not block_hit
        ):
            return AccessState.PUBLIC
        if not body:
            return AccessState.UNKNOWN
        return AccessState.PUBLIC

    if any(p.search(body) for p in _PUBLIC_MARKERS):
        return AccessState.PUBLIC

    if code is None and body:
        # Fixture load without status: prefer public when app markers present.
        return AccessState.UNKNOWN

    if code is not None and code >= 400:
        return AccessState.BLOCKED

    return AccessState.UNKNOWN


def is_terminal_block(state: AccessState) -> bool:
    """True when the fetcher must stop expanding pagination/detail links."""
    return state in {
        AccessState.CAPTCHA,
        AccessState.BLOCKED,
        AccessState.THROTTLED,
        AccessState.NOT_FOUND,
    }
