"""Tests for question_bank import and session cookie helpers."""

from __future__ import annotations

import json
from pathlib import Path

from ibpe_corpus.adapters.glassdoor.question_bank import import_question_bank
from ibpe_corpus.adapters.glassdoor.session import (
    cookies_for_httpx,
    has_usable_session,
    load_session_cookies,
)
from ibpe_corpus.schemas.models import ExtractionClass


def test_import_question_bank_counts() -> None:
    result = import_question_bank("data/question_bank.json")
    assert result.access_state.value == "public"
    exact = [
        r for r in result.extracted if r.record_type == ExtractionClass.EXACT_QUESTION
    ]
    assert len(exact) >= 2800
    assert result.metrics["exact_questions"] == len(exact)
    # PE track present (small) and IB dominant
    pe = [r for r in exact if (r.extracted_metadata or {}).get("track") == "PE"]
    ib = [r for r in exact if (r.extracted_metadata or {}).get("track") == "IB"]
    assert len(ib) > len(pe)
    assert len(pe) >= 1
    sample = exact[0]
    assert sample.exact_source_text
    assert sample.extracted_metadata.get("employer")


def test_import_question_bank_track_filter() -> None:
    result = import_question_bank("data/question_bank.json", tracks={"PE"})
    exact = [
        r for r in result.extracted if r.record_type == ExtractionClass.EXACT_QUESTION
    ]
    assert exact
    assert all((r.extracted_metadata or {}).get("track") == "PE" for r in exact)


def test_session_helpers_empty(tmp_path: Path) -> None:
    missing = tmp_path / "nope.json"
    assert load_session_cookies(missing) == []
    assert cookies_for_httpx([]) == {}
    assert has_usable_session(missing) is False


def test_session_helpers_with_file(tmp_path: Path) -> None:
    path = tmp_path / "glassdoor_session.json"
    path.write_text(
        json.dumps(
            {
                "cookies": [
                    {"name": "GSESSIONID", "value": "abc", "domain": ".glassdoor.com"},
                    {"name": "gdId", "value": "1", "domain": ".glassdoor.com"},
                ]
            }
        ),
        encoding="utf-8",
    )
    cookies = load_session_cookies(path)
    assert len(cookies) == 2
    assert has_usable_session(path) is True
    flat = cookies_for_httpx(cookies)
    assert flat["GSESSIONID"] == "abc"


def test_fetcher_accepts_cookies(tmp_path: Path) -> None:
    from ibpe_corpus.adapters.glassdoor.fetch import GlassdoorFetcher

    fetcher = GlassdoorFetcher(
        raw_dir=tmp_path,
        cookies={"GSESSIONID": "x"},
        session_class="authenticated_cookie",
    )
    assert fetcher.session_class == "authenticated_cookie"
    client = fetcher._get_client()
    assert "GSESSIONID" in {c.name for c in client.cookies.jar}
    fetcher.close()
