"""Glassdoor interview URL construction and QTN_ extraction."""

from __future__ import annotations

import re
from urllib.parse import urljoin

BASE_URL = "https://www.glassdoor.com"

_QTN_RE = re.compile(r"(QTN_\d+)", re.IGNORECASE)
_WHITESPACE_RE = re.compile(r"\s+")


def slugify_keyword(phrase: str) -> str:
    """Lowercase hyphenated slug for occupation search URLs."""
    cleaned = _WHITESPACE_RE.sub(" ", phrase.strip()).lower()
    return cleaned.replace(" ", "-")


def slugify_company(name: str) -> str:
    """Title-case hyphenated company slug (e.g. Goldman-Sachs)."""
    cleaned = _WHITESPACE_RE.sub(" ", name.strip())
    parts = [p.capitalize() if p.lower() != p.upper() else p for p in cleaned.split(" ")]
    return "-".join(parts)


def occupation_search_path(keyword: str, page: int = 1) -> str:
    """Build occupation search path: ``...-SRCH_KO0,<len>.htm`` (+ ``_IP{n}``)."""
    slug = slugify_keyword(keyword)
    length = len(keyword.strip())
    stem = f"/Interview/{slug}-interview-questions-SRCH_KO0,{length}"
    if page >= 2:
        return f"{stem}_IP{page}.htm"
    return f"{stem}.htm"


def occupation_search_url(keyword: str, page: int = 1) -> str:
    return urljoin(BASE_URL, occupation_search_path(keyword, page=page))


def company_interview_path(
    company_slug: str,
    employer_id: int | str,
    page: int = 1,
) -> str:
    """Build company interview path: ``...-Interview-Questions-E{id}.htm``."""
    slug = company_slug.strip().strip("/")
    stem = f"/Interview/{slug}-Interview-Questions-E{employer_id}"
    if page >= 2:
        return f"{stem}_IP{page}.htm"
    return f"{stem}.htm"


def company_interview_url(
    company_slug: str,
    employer_id: int | str,
    page: int = 1,
) -> str:
    return urljoin(BASE_URL, company_interview_path(company_slug, employer_id, page=page))


def question_detail_url(detail_path: str) -> str:
    """Absolute-ise a relative or absolute question detail path."""
    if detail_path.startswith("http://") or detail_path.startswith("https://"):
        return detail_path
    return urljoin(BASE_URL, detail_path)


def extract_qtn_ids(text_or_href: str) -> list[str]:
    """Extract unique ``QTN_`` ids from an href or arbitrary text (order preserved)."""
    seen: set[str] = set()
    out: list[str] = []
    for match in _QTN_RE.finditer(text_or_href or ""):
        digits = match.group(1).split("_", 1)[1]
        qtn = f"QTN_{digits}"
        if qtn not in seen:
            seen.add(qtn)
            out.append(qtn)
    return out


def pagination_page_from_url(url: str) -> int | None:
    """Return page number encoded as ``_IP{n}`` or 1 for first-page URLs."""
    m = re.search(r"_IP(\d+)\.htm", url or "", re.IGNORECASE)
    if m:
        return int(m.group(1))
    if url and ("SRCH_KO" in url or "Interview-Questions-E" in url) and url.endswith(".htm"):
        return 1
    return None
