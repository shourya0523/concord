"""Unit tests for Glassdoor URL helpers."""

from __future__ import annotations

from ibpe_corpus.adapters.glassdoor.urls import (
    company_interview_url,
    extract_qtn_ids,
    occupation_search_url,
    pagination_page_from_url,
    slugify_company,
    slugify_keyword,
)


def test_occupation_search_url_ib_analyst() -> None:
    url = occupation_search_url("Investment Banking Analyst")
    assert url.endswith(
        "/Interview/investment-banking-analyst-interview-questions-SRCH_KO0,26.htm"
    )
    assert "SRCH_KO0,26.htm" in url


def test_occupation_search_pagination_ip2() -> None:
    url = occupation_search_url("Investment Banking Analyst", page=2)
    assert url.endswith("_IP2.htm")
    assert "SRCH_KO0,26_IP2.htm" in url


def test_pe_associate_length() -> None:
    url = occupation_search_url("Private Equity Associate")
    assert "SRCH_KO0,24.htm" in url
    assert slugify_keyword("Private Equity Associate") == "private-equity-associate"


def test_company_interview_url() -> None:
    url = company_interview_url("Goldman-Sachs", 2800)
    assert url.endswith("/Interview/Goldman-Sachs-Interview-Questions-E2800.htm")
    page2 = company_interview_url("Goldman-Sachs", 2800, page=2)
    assert page2.endswith("_IP2.htm")


def test_slugify_company() -> None:
    assert slugify_company("Goldman Sachs") == "Goldman-Sachs"


def test_extract_qtn_ids() -> None:
    href = "/Interview/Foo-Interview-Question-QTN_1000000001.htm#answers"
    assert extract_qtn_ids(href) == ["QTN_1000000001"]
    assert extract_qtn_ids("no ids here") == []


def test_pagination_page_from_url() -> None:
    assert (
        pagination_page_from_url(
            "https://www.glassdoor.com/Interview/x-interview-questions-SRCH_KO0,26_IP2.htm"
        )
        == 2
    )
    assert (
        pagination_page_from_url(
            "https://www.glassdoor.com/Interview/x-interview-questions-SRCH_KO0,26.htm"
        )
        == 1
    )
