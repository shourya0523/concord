"""Ingest source-provided answers from QuestionResponse / ExtractedRecord."""

from __future__ import annotations

import re

from ibpe_corpus.canonical.taxonomy_rules import normalise_difficulty
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    ExtractedRecord,
    ExtractionClass,
    QuestionResponse,
    ResponseType,
    ValidationStatus,
)

# Only these response / extraction classes may become SOURCE_PROVIDED answers.
_INGESTIBLE_RESPONSE_TYPES = frozenset(
    {
        ResponseType.CANDIDATE_ANSWER,
        ResponseType.COMMUNITY_ANSWER,
    }
)

_INGESTIBLE_EXTRACTION_CLASSES = frozenset(
    {
        ExtractionClass.SOURCE_PROVIDED_ANSWER,
        ExtractionClass.COMMUNITY_ANSWER,
        ExtractionClass.CANDIDATE_ATTEMPT,
    }
)

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9$(\"“'])")
CONCISE_MIN_CHARS = 120
CONCISE_MAX_CHARS = 320
SPLIT_MIN_CHARS = 260


def split_concise_expanded(text: str) -> tuple[str, str]:
    """Extractive concise/expanded split of a single source answer (plan P2.4).

    Long multi-sentence source answers get a concise lead made of their own
    opening sentences (verbatim — no invented words, so provenance stays
    ``source_provided``) and keep the full text as the expanded explanation.
    Short answers stay identical and are tagged ``needs_expansion`` later.
    """
    body = " ".join((text or "").split())
    if len(body) < SPLIT_MIN_CHARS:
        return body, body
    sentences = [s for s in _SENTENCE_SPLIT_RE.split(body) if s.strip()]
    if len(sentences) < 2:
        if len(body) > 500:
            return body[:497].rstrip() + "...", body
        return body, body
    lead: list[str] = []
    for sent in sentences:
        candidate = " ".join([*lead, sent])
        if lead and len(candidate) > CONCISE_MAX_CHARS:
            break
        lead.append(sent)
        if len(candidate) >= CONCISE_MIN_CHARS:
            break
    if len(lead) == len(sentences):
        return body, body
    concise = " ".join(lead)
    if len(concise) > 500:
        concise = concise[:497].rstrip() + "..."
    return concise, body


def ingest_question_response(
    response: QuestionResponse,
    *,
    canonical_question_id: str | None = None,
) -> Answer | None:
    """Convert a source QuestionResponse into an Answer with SOURCE_PROVIDED.

    Returns ``None`` when the response is not an ingestible answer type or
    the text is empty. Never invents content — concise/expanded mirror source.
    """
    text = (response.exact_source_text or "").strip()
    if not text:
        return None
    if not response.source_provided:
        return None
    if response.response_type not in _INGESTIBLE_RESPONSE_TYPES:
        return None

    cq_id = canonical_question_id or response.question_id
    source_ids = [response.id]
    if response.source_artefact_id:
        source_ids.append(response.source_artefact_id)
    if response.source_response_id:
        source_ids.append(response.source_response_id)

    concise, expanded = split_concise_expanded(text)
    return Answer(
        canonical_question_id=cq_id,
        concise_answer=concise,
        expanded_explanation=expanded,
        assumptions=[],
        calculation_representation=None,
        common_mistakes=[],
        follow_ups=[],
        provenance_type=AnswerProvenance.SOURCE_PROVIDED,
        source_ids=source_ids,
        generator_version=None,
        validator_version=None,
        validation_status=ValidationStatus.NOT_RUN,
        confidence=max(0.5, float(response.classification_confidence or 0.5)),
        difficulty=None,
        references=[response.source_url] if response.source_url else [],
    )


def ingest_extracted_record(
    record: ExtractedRecord,
    *,
    canonical_question_id: str,
) -> Answer | None:
    """Convert an ExtractedRecord source answer into Answer with SOURCE_PROVIDED.

    Playbook records (coryjburk) carry ``deepdive`` / ``red_flag`` /
    ``coaching`` metadata: model answer → concise, model answer + deep dive →
    expanded, red flag → ``common_mistakes``, coaching → ``coaching_notes``
    (rubric seed hints). All of it is verbatim source text.
    """
    text = (record.exact_source_text or "").strip()
    if not text:
        return None
    if record.record_type not in _INGESTIBLE_EXTRACTION_CLASSES:
        return None

    meta = record.extracted_metadata or {}
    deep = " ".join(str(meta.get("deepdive") or "").split())
    red_flag = " ".join(str(meta.get("red_flag") or "").split())
    coaching = " ".join(str(meta.get("coaching") or "").split())
    if deep:
        concise = " ".join(text.split())
        expanded = f"{concise}\n\n{deep}"
    else:
        concise, expanded = split_concise_expanded(text)
    references: list[str] = []
    if meta.get("category"):
        references.append(f"Source category: {meta['category']}")

    return Answer(
        canonical_question_id=canonical_question_id,
        concise_answer=concise,
        expanded_explanation=expanded,
        assumptions=[],
        calculation_representation=None,
        common_mistakes=[red_flag] if red_flag else [],
        follow_ups=[],
        provenance_type=AnswerProvenance.SOURCE_PROVIDED,
        source_ids=[record.id, record.source_artefact_id],
        generator_version=None,
        validator_version=None,
        validation_status=ValidationStatus.NOT_RUN,
        confidence=max(0.5, float(record.grounding_confidence or 0.5)),
        difficulty=normalise_difficulty(meta.get("difficulty")),
        references=references,
        coaching_notes=[coaching] if coaching else [],
    )
