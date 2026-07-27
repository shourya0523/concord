"""Canonical shared schemas for the IB/PE corpus pipeline.

These models are the frozen interface contract for all workstreams.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, HttpUrl


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


class AccessState(str, Enum):
    PUBLIC = "public"
    AUTHENTICATED = "authenticated"
    BLOCKED = "blocked"
    CAPTCHA = "captcha"
    THROTTLED = "throttled"
    NOT_FOUND = "not_found"
    UNKNOWN = "unknown"


class ExtractionClass(str, Enum):
    EXACT_QUESTION = "exact_question"
    PARAPHRASED_QUESTION = "paraphrased_question"
    TOPIC_SIGNAL = "topic_signal"
    INTERVIEW_FORMAT = "interview_format"
    SOURCE_PROVIDED_ANSWER = "source_provided_answer"
    CANDIDATE_ATTEMPT = "candidate_attempt"
    COMMUNITY_ANSWER = "community_answer"
    DISCUSSION_COMMENT = "discussion_comment"
    PREPARATION_ADVICE = "preparation_advice"
    NOT_RELEVANT = "not_relevant"


class ResponseType(str, Enum):
    CANDIDATE_ANSWER = "candidate_answer"
    COMMUNITY_ANSWER = "community_answer"
    CLARIFICATION = "clarification"
    DISCUSSION_COMMENT = "discussion_comment"
    SPAM_OR_IRRELEVANT = "spam_or_irrelevant"
    UNKNOWN = "unknown"


class PERelevance(str, Enum):
    CORE_PE_INVESTING = "core_pe_investing"
    ADJACENT_PE_INVESTING = "adjacent_pe_investing"
    PORTFOLIO_OPERATIONS = "portfolio_operations"
    ALLOCATOR_OR_FUND_SELECTION = "allocator_or_fund_selection"
    PE_ADVISORY = "pe_advisory"
    FUND_OPERATIONS = "fund_operations"
    NOT_PE = "not_pe"


class AnswerProvenance(str, Enum):
    SOURCE_PROVIDED = "source_provided"
    CORPUS_MATCHED = "corpus_matched"
    SYNTHESISED_UNVALIDATED = "synthesised_unvalidated"
    SYNTHESISED_VALIDATED = "synthesised_validated"
    NEEDS_REVIEW = "needs_review"
    REJECTED = "rejected"


class ValidationStatus(str, Enum):
    PASS = "pass"
    PASS_WITH_ASSUMPTIONS = "pass_with_assumptions"
    NEEDS_CORRECTION = "needs_correction"
    REJECT = "reject"
    NOT_RUN = "not_run"


class Domain(str, Enum):
    IB = "ib"
    PE = "pe"
    BOTH = "both"
    OTHER = "other"


class RawArtefact(BaseModel):
    id: str = Field(default_factory=lambda: new_id("art"))
    source_family: str
    url_or_path: str
    commit_sha: str | None = None
    retrieved_at: datetime = Field(default_factory=utcnow)
    raw_html_path: str | None = None
    raw_json_path: str | None = None
    screenshot_path: str | None = None
    network_log_path: str | None = None
    content_hash: str
    parser_version: str
    access_state: AccessState = AccessState.UNKNOWN
    session_class: str = "unauthenticated"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ExtractedRecord(BaseModel):
    id: str = Field(default_factory=lambda: new_id("raw"))
    source_artefact_id: str
    exact_source_text: str
    source_selector_or_span: str | None = None
    record_type: ExtractionClass
    extraction_method: str
    extracted_metadata: dict[str, Any] = Field(default_factory=dict)
    grounding_confidence: float = 1.0
    validation_status: ValidationStatus = ValidationStatus.NOT_RUN


class CanonicalQuestion(BaseModel):
    id: str = Field(default_factory=lambda: new_id("cq"))
    canonical_wording: str
    question_type: str = "technical"
    topic: str | None = None
    subtopic: str | None = None
    domain: Domain = Domain.OTHER
    pe_strategy: str | None = None
    pe_relevance: PERelevance | None = None
    seniority: str | None = None
    difficulty: str | None = None
    review_state: str = "accepted"
    normalised_hash: str | None = None


class QuestionVariant(BaseModel):
    id: str = Field(default_factory=lambda: new_id("qv"))
    canonical_question_id: str
    source_wording: str
    cleaned_wording: str
    normalised_hash: str
    language: str = "en"
    variant_type: Literal[
        "exact", "paraphrase", "topic_signal", "numerical_variant"
    ] = "exact"
    source_artefact_id: str | None = None
    embedding: list[float] | None = None


class InterviewOccurrence(BaseModel):
    id: str = Field(default_factory=lambda: new_id("occ"))
    question_variant_id: str
    interview_review_id: str | None = None
    employer: str | None = None
    employer_id: str | None = None
    role: str | None = None
    office: str | None = None
    round: str | None = None
    interview_date: str | None = None
    recruiting_cycle: str | None = None
    outcome: str | None = None
    source_id: str
    confidence: float = 1.0
    detail_url: str | None = None


class QuestionResponse(BaseModel):
    id: str = Field(default_factory=lambda: new_id("resp"))
    question_id: str
    source_response_id: str | None = None
    response_type: ResponseType
    exact_source_text: str
    source_provided: bool = True
    posted_date: str | None = None
    helpful_metadata: dict[str, Any] = Field(default_factory=dict)
    classification_confidence: float = 0.5
    parent_response_id: str | None = None
    source_url: str | None = None
    access_state: AccessState = AccessState.PUBLIC
    source_artefact_id: str | None = None


class Answer(BaseModel):
    id: str = Field(default_factory=lambda: new_id("ans"))
    canonical_question_id: str
    concise_answer: str
    expanded_explanation: str
    assumptions: list[str] = Field(default_factory=list)
    calculation_representation: dict[str, Any] | None = None
    common_mistakes: list[str] = Field(default_factory=list)
    follow_ups: list[str] = Field(default_factory=list)
    provenance_type: AnswerProvenance
    source_ids: list[str] = Field(default_factory=list)
    generator_version: str | None = None
    validator_version: str | None = None
    validation_status: ValidationStatus = ValidationStatus.NOT_RUN
    confidence: float = 0.5
    difficulty: str | None = None
    references: list[str] = Field(default_factory=list)


class JobState(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"
    SKIPPED = "skipped"


class JobResult(BaseModel):
    job_name: str
    idempotency_key: str
    state: JobState
    started_at: datetime | None = None
    completed_at: datetime | None = None
    retry_count: int = 0
    error_classification: str | None = None
    input_count: int = 0
    output_count: int = 0
    parser_or_model_version: str | None = None
    resume_checkpoint: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, float | int] = Field(default_factory=dict)
    message: str | None = None


class DeadLetter(BaseModel):
    id: str = Field(default_factory=lambda: new_id("dlq"))
    job_name: str
    idempotency_key: str
    error_classification: str
    error_message: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)
    retryable: bool = False


class SourceAdapterResult(BaseModel):
    """Return type for all source adapters."""

    artefacts: list[RawArtefact] = Field(default_factory=list)
    extracted: list[ExtractedRecord] = Field(default_factory=list)
    responses: list[QuestionResponse] = Field(default_factory=list)
    access_state: AccessState = AccessState.UNKNOWN
    diagnostics: list[str] = Field(default_factory=list)
    metrics: dict[str, int | float] = Field(default_factory=dict)


class FixtureMeta(BaseModel):
    fixture_id: str
    surface: Literal[
        "occupation_search", "company_interview", "question_detail", "blocked"
    ]
    fixture_origin: Literal["captured", "synthetic"]
    url: str | None = None
    access_state: AccessState
    content_hash: str | None = None
    notes: str | None = None
    retrieved_at: datetime | None = None


class Employer(BaseModel):
    employer_id: str
    dynamic_profile_id: str | None = None
    name: str
    slug: str | None = None
    industry: str | None = None
    country: str | None = None


class OccupationSearch(BaseModel):
    search_phrase: str
    normalised_role: str
    sort: str = "relevance"
    page_or_cursor: str | int = 1
    total_count: int | None = None
    retrieved_at: datetime = Field(default_factory=utcnow)
    url: str | None = None


class InterviewReview(BaseModel):
    review_id: str
    employer: str | None = None
    employer_id: str | None = None
    role: str | None = None
    office: str | None = None
    interview_date: str | None = None
    reported_date: str | None = None
    round: str | None = None
    process_description: str | None = None
    outcome: str | None = None
    offer_status: str | None = None
    difficulty: str | None = None
    experience_sentiment: str | None = None
    source_url: str | None = None


class InterviewQuestionNode(BaseModel):
    question_id: str
    exact_source_wording: str
    parent_review_id: str | None = None
    employer: str | None = None
    role: str | None = None
    date: str | None = None
    detail_url: str | None = None
    comment_count: int = 0
    answer_count: int = 0


# Avoid unused import warnings for HttpUrl while keeping it available for adapters.
_ = HttpUrl
