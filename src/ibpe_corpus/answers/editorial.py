"""Editorial review queue stubs for human gold answers."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from ibpe_corpus.answers.provenance import EnrichmentProvenance, assert_not_source_laundering
from ibpe_corpus.schemas.models import new_id, utcnow


class ReviewQueueStatus(str, Enum):
    PENDING = "pending"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    DEFERRED = "deferred"


class EditorialReviewItem(BaseModel):
    """Stub queue row — publication still requires provenance + validators."""

    id: str = Field(default_factory=lambda: new_id("edq"))
    canonical_question_id: str
    answer_id: str | None = None
    enrichment_id: str | None = None
    reason: str
    status: ReviewQueueStatus = ReviewQueueStatus.PENDING
    priority: int = 0
    assignee: str | None = None
    notes: str | None = None
    provenance: EnrichmentProvenance = EnrichmentProvenance.EDITORIAL
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EditorialReviewQueue:
    """In-memory / JSON-serialisable review queue stub (no UI)."""

    def __init__(self) -> None:
        self._items: dict[str, EditorialReviewItem] = {}

    def enqueue(
        self,
        *,
        canonical_question_id: str,
        reason: str,
        answer_id: str | None = None,
        enrichment_id: str | None = None,
        priority: int = 0,
        metadata: dict[str, Any] | None = None,
    ) -> EditorialReviewItem:
        item = EditorialReviewItem(
            canonical_question_id=canonical_question_id,
            answer_id=answer_id,
            enrichment_id=enrichment_id,
            reason=reason,
            priority=priority,
            metadata=metadata or {},
        )
        assert_not_source_laundering(
            provenance=item.provenance.value,
            generator_version=None,
        )
        # Editorial must never be labelled Glassdoor / GitHub source.
        if item.provenance.value in {"glassdoor", "github_source", "source_provided"}:
            raise ValueError("Editorial items cannot use corpus teaching provenance")
        self._items[item.id] = item
        return item

    def get(self, item_id: str) -> EditorialReviewItem | None:
        return self._items.get(item_id)

    def list_pending(self) -> list[EditorialReviewItem]:
        return sorted(
            (i for i in self._items.values() if i.status == ReviewQueueStatus.PENDING),
            key=lambda x: (-x.priority, x.created_at),
        )

    def transition(
        self,
        item_id: str,
        status: ReviewQueueStatus,
        *,
        notes: str | None = None,
        assignee: str | None = None,
    ) -> EditorialReviewItem:
        item = self._items[item_id]
        updated = item.model_copy(
            update={
                "status": status,
                "notes": notes if notes is not None else item.notes,
                "assignee": assignee if assignee is not None else item.assignee,
                "updated_at": utcnow(),
            }
        )
        self._items[item_id] = updated
        return updated

    def to_list(self) -> list[dict[str, Any]]:
        return [i.model_dump(mode="json") for i in self._items.values()]
