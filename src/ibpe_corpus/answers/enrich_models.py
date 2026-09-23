"""Enrichment proposal schemas for offline LLM batch jobs (Mode A/B graphs).

``EnrichDraft`` is the structured-output contract sent to OpenRouter
(``response_format.json_schema`` is generated from it); ``EnrichmentProposal``
is the staged record built from a validated draft.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

from ibpe_corpus.answers.provenance import EnrichmentProvenance
from ibpe_corpus.schemas.models import new_id, utcnow


class LearningMode(str, Enum):
    COMPANY_PREP = "company_prep"
    CONCEPT_LEARN = "concept_learn"
    BOTH = "both"


class EnrichmentStatus(str, Enum):
    STAGED = "staged"
    VALIDATED = "validated"
    NEEDS_REVIEW = "needs_review"
    REJECTED = "rejected"
    PUBLISHED = "published"


class FirmSoftTag(BaseModel):
    """Soft firm relevance — join later with Glassdoor topic heat (Mode A)."""

    firm_id: str
    firm_name: str | None = None
    relevance: float = Field(ge=0.0, le=1.0, default=0.5)
    rationale: str | None = None


class ConceptHint(BaseModel):
    slug: str
    title: str | None = None
    prerequisites: list[str] = Field(default_factory=list)


class DiagramDraft(BaseModel):
    id: str = Field(default_factory=lambda: new_id("diag"))
    type: str = "generic"
    format: Literal["mermaid", "interactive-json"] = "mermaid"
    spec: str
    a11y_fallback: str | None = None
    provenance: EnrichmentProvenance = EnrichmentProvenance.LLM_SYNTHESISED


class ResourceDraft(BaseModel):
    id: str = Field(default_factory=lambda: new_id("res"))
    label: str
    url: str
    kind: Literal["internal", "external"] = "external"
    concept_ids: list[str] = Field(default_factory=list)
    firm_ids: list[str] = Field(default_factory=list)
    provenance: EnrichmentProvenance = EnrichmentProvenance.LLM_SYNTHESISED


class ModeRouting(BaseModel):
    """Whether this item feeds company prep, concept lab, or both."""

    modes: list[LearningMode] = Field(default_factory=lambda: [LearningMode.BOTH])
    company_prep_weight: float = Field(ge=0.0, le=1.0, default=0.5)
    concept_learn_weight: float = Field(ge=0.0, le=1.0, default=0.5)

    def for_company_prep(self) -> bool:
        return (
            LearningMode.COMPANY_PREP in self.modes
            or LearningMode.BOTH in self.modes
            or self.company_prep_weight > 0
        )

    def for_concept_lab(self) -> bool:
        return (
            LearningMode.CONCEPT_LEARN in self.modes
            or LearningMode.BOTH in self.modes
            or self.concept_learn_weight > 0
        )


class EnrichmentProposal(BaseModel):
    """Staged LLM enrichment for one canonical question / Q–A pair."""

    id: str = Field(default_factory=lambda: new_id("enr"))
    canonical_question_id: str
    track: str | None = None
    topic: str | None = None
    subtopic: str | None = None
    concepts: list[ConceptHint] = Field(default_factory=list)
    difficulty: str | None = None
    interview_stage_hints: list[str] = Field(default_factory=list)
    firm_soft_tags: list[FirmSoftTag] = Field(default_factory=list)
    mode_routing: ModeRouting = Field(default_factory=ModeRouting)
    pe_relevance: str | None = None
    ib_relevance: str | None = None
    interview_ready_rewrite: str | None = None
    diagram_drafts: list[DiagramDraft] = Field(default_factory=list)
    resource_drafts: list[ResourceDraft] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    status: EnrichmentStatus = EnrichmentStatus.STAGED
    provenance: EnrichmentProvenance = EnrichmentProvenance.LLM_SYNTHESISED
    model_version: str
    prompt_version: str
    created_at: datetime = Field(default_factory=utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)

    def model_post_init(self, __context: Any) -> None:
        # Hard lock: enrichment is never glassdoor / github teaching source.
        if self.provenance != EnrichmentProvenance.LLM_SYNTHESISED:
            if self.provenance != EnrichmentProvenance.EDITORIAL:
                object.__setattr__(
                    self, "provenance", EnrichmentProvenance.LLM_SYNTHESISED
                )


class CompanyPrepNode(BaseModel):
    """Mode A graph node: firm × topic practice item."""

    firm_id: str
    topic_id: str
    canonical_question_id: str
    enrichment_id: str
    soft_relevance: float = 0.5
    provenance: EnrichmentProvenance = EnrichmentProvenance.LLM_SYNTHESISED


class ConceptLabNode(BaseModel):
    """Mode B graph node: concept curriculum edge."""

    concept_slug: str
    canonical_question_id: str
    enrichment_id: str
    prerequisites: list[str] = Field(default_factory=list)
    diagram_ids: list[str] = Field(default_factory=list)
    resource_ids: list[str] = Field(default_factory=list)
    provenance: EnrichmentProvenance = EnrichmentProvenance.LLM_SYNTHESISED


class EnrichmentGraphSlice(BaseModel):
    """Outputs that power company prep + concept lab (not browse-path)."""

    company_prep: list[CompanyPrepNode] = Field(default_factory=list)
    concept_lab: list[ConceptLabNode] = Field(default_factory=list)
    proposals: list[EnrichmentProposal] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Structured-output contract (enrich-v1 over OpenRouter)                      #
# --------------------------------------------------------------------------- #


class DiagramDraftOut(BaseModel):
    """Model-side diagram draft (ids / provenance are assigned on staging)."""

    type: str = "generic"
    format: Literal["mermaid"] = "mermaid"
    spec: str
    a11y_fallback: str | None = None


class ResourceDraftOut(BaseModel):
    label: str
    url: str
    kind: Literal["internal", "external"] = "external"
    concept_ids: list[str] = Field(default_factory=list)


class EnrichDraft(BaseModel):
    """What the model returns for prompt ``enrich-v1`` (validated with Pydantic)."""

    track: Literal["IB", "PE", "Both"] | None = None
    topic: str | None = None
    subtopic: str | None = None
    concepts: list[ConceptHint] = Field(default_factory=list)
    difficulty: Literal["easy", "medium", "hard"] | None = None
    interview_stage_hints: list[str] = Field(default_factory=list)
    firm_soft_tags: list[FirmSoftTag] = Field(default_factory=list)
    mode_routing: ModeRouting = Field(default_factory=ModeRouting)
    pe_relevance: str | None = None
    ib_relevance: str | None = None
    interview_ready_rewrite: str | None = None
    diagram_drafts: list[DiagramDraftOut] = Field(default_factory=list)
    resource_drafts: list[ResourceDraftOut] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
