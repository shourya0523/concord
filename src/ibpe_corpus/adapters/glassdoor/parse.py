"""Deterministic Glassdoor HTML parser (NEXT_DATA / Apollo / DOM fallback)."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ibpe_corpus import PARSER_VERSION
from ibpe_corpus.adapters.glassdoor.access import detect_access_state, is_terminal_block
from ibpe_corpus.adapters.glassdoor.urls import BASE_URL, extract_qtn_ids
from ibpe_corpus.schemas.models import (
    AccessState,
    ExtractionClass,
    ExtractedRecord,
    QuestionResponse,
    RawArtefact,
    ResponseType,
    SourceAdapterResult,
)

_COUNT_RE = re.compile(r"(\d+)")


def _normalise_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _parse_count(text: str | None) -> int:
    if not text:
        return 0
    m = _COUNT_RE.search(text)
    return int(m.group(1)) if m else 0


def _absolute_url(href: str | None, base: str = BASE_URL) -> str | None:
    if not href:
        return None
    return urljoin(base, href)


def _load_next_data(soup: BeautifulSoup) -> dict[str, Any] | None:
    tag = soup.find("script", id="__NEXT_DATA__")
    if tag is None or not tag.string:
        return None
    try:
        return json.loads(tag.string)
    except json.JSONDecodeError:
        return None


def _apollo_state_from_next(next_data: dict[str, Any] | None) -> dict[str, Any]:
    if not next_data:
        return {}
    page_props = (next_data.get("props") or {}).get("pageProps") or {}
    state = page_props.get("apolloState") or page_props.get("apolloCache") or {}
    return state if isinstance(state, dict) else {}


def _interview_question_nodes(apollo: dict[str, Any]) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    for key, value in apollo.items():
        if not isinstance(value, dict):
            continue
        if value.get("__typename") == "InterviewQuestion" or str(key).startswith(
            "InterviewQuestion:"
        ):
            nodes.append(value)
    return nodes


def _classify_comment(text: str) -> ResponseType:
    lowered = text.lower()
    if any(tok in lowered for tok in ("clarif", "assum", "what do you mean", "could you")):
        return ResponseType.CLARIFICATION
    return ResponseType.DISCUSSION_COMMENT


def _extract_from_apollo(
    apollo: dict[str, Any],
    *,
    artefact_id: str,
    source_url: str | None,
) -> tuple[list[ExtractedRecord], list[QuestionResponse], list[str], dict[str, Any]]:
    extracted: list[ExtractedRecord] = []
    responses: list[QuestionResponse] = []
    pagination_urls: list[str] = []
    meta: dict[str, Any] = {"extraction_method": "next_data_apollo"}

    for node in _interview_question_nodes(apollo):
        qid = str(node.get("id") or "")
        text = _normalise_text(str(node.get("questionText") or ""))
        if not text:
            continue
        answer_count = int(node.get("answerCount") or 0)
        comment_count = int(node.get("commentCount") or 0)
        # Detail pages embed answers/comments arrays instead of counts.
        answers = node.get("answers") or []
        comments = node.get("comments") or []
        if isinstance(answers, list) and answers:
            answer_count = max(answer_count, len(answers))
        if isinstance(comments, list) and comments:
            comment_count = max(comment_count, len(comments))

        detail_url = node.get("detailUrl")
        detail_abs = _absolute_url(detail_url, source_url or BASE_URL) if detail_url else source_url
        company = node.get("company") or node.get("employer") or {}
        employer_name = None
        employer_id = None
        if isinstance(company, dict):
            employer_name = company.get("name")
            employer_id = company.get("ei") or company.get("id")

        extracted.append(
            ExtractedRecord(
                source_artefact_id=artefact_id,
                exact_source_text=text,
                source_selector_or_span=f"apollo:InterviewQuestion:{qid}",
                record_type=ExtractionClass.EXACT_QUESTION,
                extraction_method="next_data_apollo",
                extracted_metadata={
                    "question_id": qid,
                    "detail_url": detail_abs,
                    "answer_count": answer_count,
                    "comment_count": comment_count,
                    "employer": employer_name,
                    "employer_id": employer_id,
                    "role": node.get("jobTitle"),
                    "normalised_text": text,
                },
                grounding_confidence=0.95,
            )
        )

        if isinstance(answers, list):
            for ans in answers:
                if not isinstance(ans, dict):
                    continue
                body = _normalise_text(str(ans.get("body") or ""))
                if not body:
                    continue
                responses.append(
                    QuestionResponse(
                        question_id=qid,
                        source_response_id=str(ans.get("id")) if ans.get("id") else None,
                        response_type=ResponseType.CANDIDATE_ANSWER,
                        exact_source_text=body,
                        source_provided=True,
                        helpful_metadata={
                            "helpful_count": ans.get("helpfulCount"),
                            "normalised_text": body,
                        },
                        classification_confidence=0.85,
                        source_url=detail_abs or source_url,
                        access_state=AccessState.PUBLIC,
                        source_artefact_id=artefact_id,
                    )
                )

        if isinstance(comments, list):
            for com in comments:
                if not isinstance(com, dict):
                    continue
                body = _normalise_text(str(com.get("body") or ""))
                if not body:
                    continue
                responses.append(
                    QuestionResponse(
                        question_id=qid,
                        source_response_id=str(com.get("id")) if com.get("id") else None,
                        response_type=_classify_comment(body),
                        exact_source_text=body,
                        source_provided=True,
                        helpful_metadata={"normalised_text": body},
                        classification_confidence=0.75,
                        source_url=detail_abs or source_url,
                        access_state=AccessState.PUBLIC,
                        source_artefact_id=artefact_id,
                    )
                )

    # Pagination hints from ROOT_QUERY pageInfo
    for key, value in apollo.items():
        if not isinstance(value, dict):
            continue
        page_info = value.get("pageInfo")
        if isinstance(page_info, dict):
            next_page = page_info.get("nextPage")
            if next_page and isinstance(next_page, int) and next_page >= 2:
                meta["next_page"] = next_page

    return extracted, responses, pagination_urls, meta


def _extract_dom_questions(
    soup: BeautifulSoup,
    *,
    artefact_id: str,
    source_url: str | None,
) -> tuple[list[ExtractedRecord], list[QuestionResponse]]:
    extracted: list[ExtractedRecord] = []
    responses: list[QuestionResponse] = []

    cards = soup.select('[data-test="InterviewQuestionCard"]')
    for card in cards:
        qid = card.get("data-question-id") or ""
        title = card.select_one('[data-test="question-title"]')
        href = title.get("href") if title else None
        if not qid and href:
            ids = extract_qtn_ids(href)
            qid = ids[0] if ids else ""
        text = _normalise_text(title.get_text(" ", strip=True) if title else "")
        if not text:
            # company review list: question-link
            link = card.select_one('[data-test="question-link"]')
            if link:
                text = _normalise_text(link.get_text(" ", strip=True))
                href = link.get("href") or href
                if not qid and href:
                    ids = extract_qtn_ids(href)
                    qid = ids[0] if ids else ""
        if not text:
            continue
        answer_el = card.select_one('[data-test="answer-count"]')
        comment_el = card.select_one('[data-test="comment-count"]')
        answer_count = _parse_count(answer_el.get_text(" ", strip=True) if answer_el else "")
        comment_count = _parse_count(comment_el.get_text(" ", strip=True) if comment_el else "")
        detail_abs = _absolute_url(href, source_url or BASE_URL)
        extracted.append(
            ExtractedRecord(
                source_artefact_id=artefact_id,
                exact_source_text=text,
                source_selector_or_span='[data-test="InterviewQuestionCard"]',
                record_type=ExtractionClass.EXACT_QUESTION,
                extraction_method="dom_fallback",
                extracted_metadata={
                    "question_id": qid,
                    "detail_url": detail_abs,
                    "answer_count": answer_count,
                    "comment_count": comment_count,
                    "normalised_text": text,
                },
                grounding_confidence=0.85,
            )
        )

    # Company interview pages: question links inside reviews
    if not cards:
        for link in soup.select('[data-test="question-link"]'):
            href = link.get("href") or ""
            ids = extract_qtn_ids(href)
            qid = ids[0] if ids else ""
            text = _normalise_text(link.get_text(" ", strip=True))
            if not text:
                continue
            parent = link.find_parent("section") or link.parent
            answer_count = 0
            comment_count = 0
            if parent:
                a = parent.select_one('[data-test="answer-count"]')
                c = parent.select_one('[data-test="comment-count"]')
                answer_count = _parse_count(a.get_text(" ", strip=True) if a else "")
                comment_count = _parse_count(c.get_text(" ", strip=True) if c else "")
            extracted.append(
                ExtractedRecord(
                    source_artefact_id=artefact_id,
                    exact_source_text=text,
                    source_selector_or_span='[data-test="question-link"]',
                    record_type=ExtractionClass.EXACT_QUESTION,
                    extraction_method="dom_fallback",
                    extracted_metadata={
                        "question_id": qid,
                        "detail_url": _absolute_url(href, source_url or BASE_URL),
                        "answer_count": answer_count,
                        "comment_count": comment_count,
                        "normalised_text": text,
                    },
                    grounding_confidence=0.8,
                )
            )

    # Question detail page
    detail = soup.select_one('[data-test="QuestionDetail"]')
    if detail is not None:
        qid = detail.get("data-question-id") or ""
        h1 = detail.find("h1")
        text = _normalise_text(h1.get_text(" ", strip=True) if h1 else "")
        if text:
            # Avoid duplicate if apollo already added; caller dedupes by text+qid.
            if not any(
                r.extracted_metadata.get("question_id") == qid and qid
                for r in extracted
            ):
                extracted.append(
                    ExtractedRecord(
                        source_artefact_id=artefact_id,
                        exact_source_text=text,
                        source_selector_or_span='[data-test="QuestionDetail"] h1',
                        record_type=ExtractionClass.EXACT_QUESTION,
                        extraction_method="dom_fallback",
                        extracted_metadata={
                            "question_id": qid,
                            "detail_url": source_url,
                            "answer_count": len(detail.select('[data-test="answer"]')),
                            "comment_count": len(detail.select('[data-test="comment"]')),
                            "normalised_text": text,
                        },
                        grounding_confidence=0.9,
                    )
                )

        for ans in detail.select('[data-test="answer"]'):
            body = _normalise_text(ans.get_text(" ", strip=True))
            if not body:
                continue
            responses.append(
                QuestionResponse(
                    question_id=qid,
                    source_response_id=ans.get("data-answer-id"),
                    response_type=ResponseType.CANDIDATE_ANSWER,
                    exact_source_text=body,
                    source_provided=True,
                    helpful_metadata={"normalised_text": body},
                    classification_confidence=0.8,
                    source_url=source_url,
                    access_state=AccessState.PUBLIC,
                    source_artefact_id=artefact_id,
                )
            )
        for com in detail.select('[data-test="comment"]'):
            body = _normalise_text(com.get_text(" ", strip=True))
            if not body:
                continue
            responses.append(
                QuestionResponse(
                    question_id=qid,
                    source_response_id=com.get("data-comment-id"),
                    response_type=_classify_comment(body),
                    exact_source_text=body,
                    source_provided=True,
                    helpful_metadata={"normalised_text": body},
                    classification_confidence=0.7,
                    source_url=source_url,
                    access_state=AccessState.PUBLIC,
                    source_artefact_id=artefact_id,
                )
            )

    return extracted, responses


def _extract_pagination_urls(soup: BeautifulSoup, source_url: str | None) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    navs = soup.select('nav[data-test="pagination"], nav[aria-label*="pagination" i]')
    for nav in navs:
        for a in nav.find_all("a", href=True):
            href = a["href"]
            abs_url = _absolute_url(href, source_url or BASE_URL)
            if not abs_url or abs_url in seen:
                continue
            label = (a.get("aria-label") or a.get_text(" ", strip=True) or "").lower()
            if "_ip" in href.lower() or "next" in label or re.search(r"\bpage\s*[2-9]", label):
                seen.add(abs_url)
                urls.append(abs_url)
            elif re.fullmatch(r"\d+", label.strip()) and label.strip() != "1":
                seen.add(abs_url)
                urls.append(abs_url)
    return urls


def _dedupe_extracted(records: list[ExtractedRecord]) -> list[ExtractedRecord]:
    seen: set[tuple[str, str]] = set()
    out: list[ExtractedRecord] = []
    for rec in records:
        key = (
            str(rec.extracted_metadata.get("question_id") or ""),
            rec.exact_source_text,
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(rec)
    return out


def _dedupe_responses(responses: list[QuestionResponse]) -> list[QuestionResponse]:
    seen: set[tuple[str, str, str]] = set()
    out: list[QuestionResponse] = []
    for resp in responses:
        key = (
            resp.question_id,
            resp.response_type.value,
            resp.exact_source_text,
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(resp)
    return out


def _missing_response_diagnostics(
    extracted: list[ExtractedRecord],
    responses: list[QuestionResponse],
) -> list[str]:
    diagnostics: list[str] = []
    response_qids = {r.question_id for r in responses}
    for rec in extracted:
        meta = rec.extracted_metadata or {}
        qid = str(meta.get("question_id") or "")
        answer_count = int(meta.get("answer_count") or 0)
        comment_count = int(meta.get("comment_count") or 0)
        if (answer_count > 0 or comment_count > 0) and qid and qid not in response_qids:
            diagnostics.append(
                f"question {qid} reports answer_count={answer_count} "
                f"comment_count={comment_count} but zero responses extracted"
            )
        elif (answer_count > 0 or comment_count > 0) and not qid and not responses:
            diagnostics.append(
                f"question reports answer_count={answer_count} "
                f"comment_count={comment_count} but zero responses extracted"
            )
    return diagnostics


def parse_html(
    html: str,
    *,
    source_url: str | None = None,
    artefact: RawArtefact | None = None,
    status_code: int | None = None,
) -> SourceAdapterResult:
    """Parse Glassdoor interview HTML into ExtractedRecord / QuestionResponse objects."""
    access_state = detect_access_state(status_code=status_code, html=html)
    diagnostics: list[str] = []
    metrics: dict[str, int | float] = {
        "exact_questions": 0,
        "responses_reached": 0,
        "zero_result_anomalies": 0,
    }

    if artefact is None:
        artefact = RawArtefact(
            source_family="glassdoor",
            url_or_path=source_url or "inline",
            content_hash=__import__("hashlib").sha256(html.encode("utf-8")).hexdigest(),
            parser_version=PARSER_VERSION,
            access_state=access_state,
            session_class="unauthenticated",
        )
    else:
        artefact.access_state = access_state

    if is_terminal_block(access_state):
        diagnostics.append(
            f"access_state={access_state.value}; refusing to parse as interview questions"
        )
        return SourceAdapterResult(
            artefacts=[artefact],
            extracted=[],
            responses=[],
            access_state=access_state,
            diagnostics=diagnostics,
            metrics=metrics,
        )

    soup = BeautifulSoup(html, "lxml")
    next_data = _load_next_data(soup)
    apollo = _apollo_state_from_next(next_data)

    extracted: list[ExtractedRecord] = []
    responses: list[QuestionResponse] = []
    extraction_method = "dom_fallback"

    if apollo:
        a_ext, a_resp, _, _meta = _extract_from_apollo(
            apollo, artefact_id=artefact.id, source_url=source_url
        )
        extracted.extend(a_ext)
        responses.extend(a_resp)
        if a_ext:
            extraction_method = "next_data_apollo"

    # Always run DOM for answers/comments/pagination enrichment; dedupe later.
    d_ext, d_resp = _extract_dom_questions(
        soup, artefact_id=artefact.id, source_url=source_url
    )
    if not extracted:
        extracted.extend(d_ext)
        extraction_method = "dom_fallback"
    else:
        # Merge any DOM-only questions (e.g. missing from apollo)
        known = {
            (str(r.extracted_metadata.get("question_id") or ""), r.exact_source_text)
            for r in extracted
        }
        for rec in d_ext:
            key = (
                str(rec.extracted_metadata.get("question_id") or ""),
                rec.exact_source_text,
            )
            if key not in known:
                extracted.append(rec)

    if not responses:
        responses.extend(d_resp)
    else:
        # Prefer apollo responses; add DOM responses that differ
        known_resp = {
            (r.question_id, r.response_type.value, r.exact_source_text) for r in responses
        }
        for resp in d_resp:
            key = (resp.question_id, resp.response_type.value, resp.exact_source_text)
            if key not in known_resp:
                responses.append(resp)

    extracted = _dedupe_extracted(extracted)
    responses = _dedupe_responses(responses)
    pagination = _extract_pagination_urls(soup, source_url)

    # Attach pagination into artefact metadata
    artefact.metadata = {
        **(artefact.metadata or {}),
        "pagination_next_urls": pagination,
        "extraction_method": extraction_method,
        "qtn_ids": [
            str(r.extracted_metadata.get("question_id"))
            for r in extracted
            if r.extracted_metadata.get("question_id")
        ],
    }

    missing = _missing_response_diagnostics(extracted, responses)
    diagnostics.extend(missing)
    metrics["exact_questions"] = len(
        [r for r in extracted if r.record_type == ExtractionClass.EXACT_QUESTION]
    )
    metrics["responses_reached"] = len(responses)
    metrics["zero_result_anomalies"] = len(missing)
    metrics["pagination_links"] = len(pagination)

    if access_state == AccessState.UNKNOWN and extracted:
        access_state = AccessState.PUBLIC
        artefact.access_state = access_state

    return SourceAdapterResult(
        artefacts=[artefact],
        extracted=extracted,
        responses=responses,
        access_state=access_state,
        diagnostics=diagnostics,
        metrics=metrics,
    )
