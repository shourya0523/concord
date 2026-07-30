"""Ingest source-provided answers from QuestionResponse / ExtractedRecord."""

from __future__ import annotations

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

    return Answer(
        canonical_question_id=cq_id,
        concise_answer=text if len(text) <= 500 else text[:497] + "...",
        expanded_explanation=text,
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
    """Convert an ExtractedRecord source answer into Answer with SOURCE_PROVIDED."""
    text = (record.exact_source_text or "").strip()
    if not text:
        return None
    if record.record_type not in _INGESTIBLE_EXTRACTION_CLASSES:
        return None

    return Answer(
        canonical_question_id=canonical_question_id,
        concise_answer=text if len(text) <= 500 else text[:497] + "...",
        expanded_explanation=text,
        assumptions=[],
        calculation_representation=None,
        common_mistakes=[],
        follow_ups=[],
        provenance_type=AnswerProvenance.SOURCE_PROVIDED,
        source_ids=[record.id, record.source_artefact_id],
        generator_version=None,
        validator_version=None,
        validation_status=ValidationStatus.NOT_RUN,
        confidence=max(0.5, float(record.grounding_confidence or 0.5)),
        difficulty=None,
        references=[],
    )
