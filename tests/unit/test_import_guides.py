"""Tests for licensed guide PDF parsing."""

from __future__ import annotations

from ibpe_corpus.adapters.guides.parse import (
    clean_guide_text,
    parse_guide_qa_pairs,
    stable_pair_id,
)
from ibpe_corpus.canonical.publish_gate import is_teaching_record


BIWS_SNIPPET = """
Teamwork/Leadership

1. Can you talk about a team project or group activity you've worked on?
You should use your "Success" story and the STAR structure for this one.

2. What are your strengths and weaknesses?
The best strengths to cite include quantitative abilities and work ethic.
"""

MI_SNIPPET = """
Accounting Questions & Answers – Basic

1. Walk me through the 3 financial statements.

"The 3 major financial statements are the Income Statement, Balance Sheet and Cash
Flow Statement. The Income Statement gives the company's revenue and expenses."

2. What happens when Depreciation goes up by $10?
"Operating Income decreases by $10 and Net Income falls by $6 assuming a 40% tax rate."
"""


def test_parse_biws_numbered_pairs():
    pairs = parse_guide_qa_pairs(BIWS_SNIPPET, source_id="biws_400_2026")
    assert len(pairs) >= 2
    assert "team project" in pairs[0]["question"].lower()
    assert "STAR" in pairs[0]["answer"]


def test_parse_mi_quoted_answers():
    pairs = parse_guide_qa_pairs(MI_SNIPPET, source_id="mi_400_ib")
    assert len(pairs) >= 2
    assert "financial statements" in pairs[0]["question"].lower()
    assert "Income Statement" in pairs[0]["answer"]


def test_stable_pair_id_deterministic():
    a = stable_pair_id("biws_400_2026", "Walk me through a DCF?")
    b = stable_pair_id("biws_400_2026", "Walk me through a DCF?")
    assert a == b
    assert a.startswith("guide_biws_400_2026_")


def test_licensed_guide_is_teaching_record():
    assert is_teaching_record(
        {
            "product_role": "teaching_qa",
            "contract_provenance": "licensed_guide",
            "source_family": "licensed_guide",
        }
    )


def test_github_rag_context_not_teaching():
    assert not is_teaching_record(
        {
            "product_role": "rag_context",
            "contract_provenance": "github_source",
            "source_family": "github",
            "not_glassdoor": True,
        }
    )


def test_clean_guide_text_strips_urls():
    raw = "Access the Full IB Interview Guide\nhttps://breakingintowallstreet.com\n1. What is WACC?"
    cleaned = clean_guide_text(raw)
    assert "breakingintowallstreet" not in cleaned
    assert "What is WACC" in cleaned
