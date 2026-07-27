"""Unit tests for Glassdoor pagination URL discovery."""

from __future__ import annotations

from pathlib import Path

from ibpe_corpus.adapters.glassdoor.adapter import GlassdoorAdapter
from ibpe_corpus.adapters.glassdoor.fetch import GlassdoorFetcher
from ibpe_corpus.adapters.glassdoor.urls import occupation_search_url

FIXTURES = Path("fixtures/glassdoor/html")


def test_occupation_fixture_exposes_page_two() -> None:
    result = GlassdoorFetcher().fetch_fixture(
        FIXTURES / "synthetic-occupation-search-ib.html"
    )
    urls = (result.artefacts[0].metadata or {}).get("pagination_next_urls") or []
    assert any(
        u.endswith(
            "/Interview/investment-banking-analyst-interview-questions-SRCH_KO0,26_IP2.htm"
        )
        or "_IP2.htm" in u
        for u in urls
    )


def test_company_fixture_pagination() -> None:
    result = GlassdoorFetcher().fetch_fixture(
        FIXTURES / "synthetic-company-interviews-goldman.html"
    )
    urls = (result.artefacts[0].metadata or {}).get("pagination_next_urls") or []
    assert any("E2800_IP2.htm" in u for u in urls)


def test_adapter_discover_roles_and_employers() -> None:
    adapter = GlassdoorAdapter(fixture_mode=True)
    targets = adapter.discover(
        {
            "roles": ["Investment Banking Analyst"],
            "employers": [
                {"name": "Goldman Sachs", "slug": "Goldman-Sachs", "employer_id": 2800}
            ],
        }
    )
    assert len(targets) == 2
    assert targets[0]["url"] == occupation_search_url("Investment Banking Analyst")
    assert targets[1]["url"].endswith("E2800.htm")


def test_adapter_parse_artefact_from_fixture() -> None:
    adapter = GlassdoorAdapter(fixture_mode=True)
    fetched = adapter.fetch(
        {"fixture": str(FIXTURES / "synthetic-occupation-search-ib.html")}
    )
    assert fetched.artefacts
    again = adapter.parse_artefact(fetched.artefacts[0])
    assert len(again.extracted) >= 2
