"""Editorial review queue for enrichment proposals and gold answers.

In-memory by default (tests / dry runs). Pass a ``CorpusStore`` to persist
queue rows in the SQLite ``editorial_queue`` table (plan P2.1) so an
enrichment run's review work survives the process.
"""

from __future__ import annotations

import json
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from ibpe_corpus.answers.provenance import EnrichmentProvenance, assert_not_source_laundering
from ibpe_corpus.schemas.models import new_id, utcnow
from ibpe_corpus.storage.db import CorpusStore, editorial_queue


class ReviewQueueStatus(str, Enum):
    PENDING = "pending"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    DEFERRED = "deferred"


class EditorialReviewItem(BaseModel):
    """Queue row — publication still requires provenance + validators."""

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


def _to_row(item: EditorialReviewItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "canonical_question_id": item.canonical_question_id,
        "answer_id": item.answer_id,
        "enrichment_id": item.enrichment_id,
        "reason": item.reason,
        "status": item.status.value,
        "priority": item.priority,
        "assignee": item.assignee,
        "notes": item.notes,
        "provenance": item.provenance.value,
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
        "metadata_json": json.dumps(item.metadata, default=str),
    }


def _from_row(row: dict[str, Any]) -> EditorialReviewItem:
    return EditorialReviewItem(
        id=row["id"],
        canonical_question_id=row["canonical_question_id"],
        answer_id=row.get("answer_id"),
        enrichment_id=row.get("enrichment_id"),
        reason=row["reason"],
        status=ReviewQueueStatus(row.get("status") or "pending"),
        priority=int(row.get("priority") or 0),
        assignee=row.get("assignee"),
        notes=row.get("notes"),
        provenance=EnrichmentProvenance(row.get("provenance") or "editorial"),
        created_at=datetime.fromisoformat(row["created_at"]) if row.get("created_at") else utcnow(),
        updated_at=datetime.fromisoformat(row["updated_at"]) if row.get("updated_at") else utcnow(),
        metadata=json.loads(row.get("metadata_json") or "{}"),
    )


class EditorialReviewQueue:
    """Review queue; durable when constructed with a ``CorpusStore``."""

    def __init__(self, store: CorpusStore | None = None) -> None:
        self.store = store
        self._items: dict[str, EditorialReviewItem] = {}
        if store is not None:
            for row in store.fetch_all(editorial_queue):
                item = _from_row(row)
                self._items[item.id] = item

    def _persist(self, item: EditorialReviewItem) -> None:
        self._items[item.id] = item
        if self.store is not None:
            self.store.upsert_dict(editorial_queue, _to_row(item))

    def enqueue(
        self,
        *,
        canonical_question_id: str,
        reason: str,
        answer_id: str | None = None,
        enrichment_id: str | None = None,
        priority: int = 0,
        metadata: dict[str, Any] | None = None,
        item_id: str | None = None,
    ) -> EditorialReviewItem:
        """Add an item. A stable ``item_id`` makes re-runs idempotent."""
        if item_id and item_id in self._items:
            existing = self._items[item_id]
            if existing.status != ReviewQueueStatus.PENDING:
                return existing
        item = EditorialReviewItem(
            **({"id": item_id} if item_id else {}),
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
        self._persist(item)
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
        self._persist(updated)
        return updated

    def to_list(self) -> list[dict[str, Any]]:
        return [i.model_dump(mode="json") for i in self._items.values()]
