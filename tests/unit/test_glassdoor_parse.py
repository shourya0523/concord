"""Unit tests for Glassdoor HTML parsing."""

from __future__ import annotations

from pathlib import Path

from ibpe_corpus.adapters.glassdoor.fetch import GlassdoorFetcher
from ibpe_corpus.adapters.glassdoor.parse import parse_html
from ibpe_corpus.schemas.models import ExtractionClass, ResponseType

FIXTURES = Path("fixtures/glassdoor/html")


def test_parse_occupation_fixture() -> None:
    path = FIXTURES / "synthetic-occupation-search-ib.html"
    result = GlassdoorFetcher().fetch_fixture(path)
    questions = [
        r for r in result.extracted if r.record_type == ExtractionClass.EXACT_QUESTION
    ]
    assert len(questions) >= 2
    qids = {r.extracted_metadata.get("question_id") for r in questions}
    assert "QTN_1000000001" in qids
    assert "QTN_1000000002" in qids
    pagination = (result.artefacts[0].metadata or {}).get("pagination_next_urls") or []
    assert any("_IP2.htm" in u for u in pagination)


def test_parse_question_detail_responses() -> None:
    path = FIXTURES / "synthetic-question-detail-qtn.html"
    result = GlassdoorFetcher().fetch_fixture(path)
    assert len(result.responses) >= 3
    answers = [
        r for r in result.responses if r.response_type == ResponseType.CANDIDATE_ANSWER
    ]
    comments = [
        r
        for r in result.responses
        if r.response_type
        in {ResponseType.CLARIFICATION, ResponseType.DISCUSSION_COMMENT}
    ]
    assert len(answers) == 2
    assert len(comments) == 1
    assert comments[0].response_type == ResponseType.CLARIFICATION


def test_parse_idempotent_normalised_texts() -> None:
    html = (FIXTURES / "synthetic-occupation-search-ib.html").read_text(encoding="utf-8")
    first = parse_html(html, source_url="https://www.glassdoor.com/Interview/x.htm")
    second = parse_html(html, source_url="https://www.glassdoor.com/Interview/x.htm")
    texts_a = sorted(r.exact_source_text for r in first.extracted)
    texts_b = sorted(r.exact_source_text for r in second.extracted)
    assert texts_a == texts_b
    norms_a = sorted(
        r.extracted_metadata.get("normalised_text") for r in first.extracted
    )
    norms_b = sorted(
        r.extracted_metadata.get("normalised_text") for r in second.extracted
    )
    assert norms_a == norms_b


def test_positive_comment_count_without_responses_diagnostic() -> None:
    html = """
    <!doctype html><html><body>
    <article data-test="InterviewQuestionCard" data-question-id="QTN_999">
      <a data-test="question-title" href="/Interview/Q-QTN_999.htm">Example question?</a>
      <a data-test="answer-count">3 Answers</a>
      <a data-test="comment-count">2 Comments</a>
    </article>
    </body></html>
    """
    result = parse_html(html, source_url="https://www.glassdoor.com/Interview/test.htm")
    assert len(result.extracted) == 1
    assert result.responses == []
    assert any("zero responses extracted" in d for d in result.diagnostics)
    assert result.extracted[0].extracted_metadata.get("comment_count") == 2
