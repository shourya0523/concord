"""Durable enrichment proposals (plan P2.1).

Proposals mirror ``staging.enrichment_proposals`` (migration 044): one row per
``(target_kind, target_id, field, prompt_version)`` with the proposed value,
the current value, model / prompt version, confidence and a review status.

* Offline / worker runs persist rows in the local SQLite ``CorpusStore``
  (``enrichment_proposals`` table) and export ``exports/enrichment_proposals.jsonl``.
* ``packages/database/scripts/publish-teaching.ts`` upserts that export into
  Postgres and applies only ``approved`` rows (human or auto-approved).
* A human decision (reviewer not ``auto:*``) is never overwritten by a re-run.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Iterable, Sequence

from ibpe_corpus.schemas.models import EnrichmentProposalRecord, utcnow
from ibpe_corpus.storage.db import CorpusStore, enrichment_proposals

AUTO_REVIEWER_PREFIX = "auto:"


def proposal_id(target_kind: str, target_id: str, field: str, prompt_version: str | None) -> str:
    """Deterministic id — same key → same row across runs (idempotent upsert)."""
    raw = f"{target_kind}|{target_id}|{field}|{prompt_version or ''}".encode()
    return "prop_" + hashlib.sha256(raw).hexdigest()[:24]


def _row(rec: EnrichmentProposalRecord) -> dict[str, Any]:
    return {
        "id": rec.id,
        "target_kind": rec.target_kind,
        "target_id": rec.target_id,
        "field": rec.field,
        "proposal_json": json.dumps(rec.proposal_json, default=str),
        "current_json": json.dumps(rec.current_json, default=str) if rec.current_json is not None else None,
        "model": rec.model,
        "prompt_version": rec.prompt_version,
        "confidence": rec.confidence,
        "status": rec.status,
        "auto_approved": 1 if rec.auto_approved else 0,
        "reviewer": rec.reviewer,
        "review_note": rec.review_note,
        "decided_at": rec.decided_at,
        "created_at": rec.created_at,
    }


def _from_row(row: dict[str, Any]) -> EnrichmentProposalRecord:
    return EnrichmentProposalRecord(
        id=row["id"],
        target_kind=row["target_kind"],
        target_id=row["target_id"],
        field=row["field"],
        proposal_json=json.loads(row["proposal_json"]) if row.get("proposal_json") else None,
        current_json=json.loads(row["current_json"]) if row.get("current_json") else None,
        model=row.get("model"),
        prompt_version=row.get("prompt_version"),
        confidence=row.get("confidence"),
        status=row.get("status") or "pending",
        auto_approved=bool(row.get("auto_approved")),
        reviewer=row.get("reviewer"),
        review_note=row.get("review_note"),
        decided_at=row.get("decided_at"),
        created_at=row.get("created_at") or utcnow().isoformat(),
    )


def is_human_decision(rec: EnrichmentProposalRecord) -> bool:
    return (
        rec.status in {"approved", "rejected", "applied"}
        and bool(rec.reviewer)
        and not str(rec.reviewer).startswith(AUTO_REVIEWER_PREFIX)
    )


class ProposalStore:
    """Proposal persistence: SQLite-backed when given a store, else in-memory."""

    def __init__(self, store: CorpusStore | None = None) -> None:
        self.store = store
        self._mem: dict[str, EnrichmentProposalRecord] = {}

    def get(self, pid: str) -> EnrichmentProposalRecord | None:
        if self.store is None:
            return self._mem.get(pid)
        row = self.store.fetch_by_pk(enrichment_proposals, pid)
        return _from_row(row) if row else None

    def upsert(self, rec: EnrichmentProposalRecord) -> EnrichmentProposalRecord:
        existing = self.get(rec.id)
        if existing is not None and is_human_decision(existing):
            # Keep the reviewer's decision; refresh only the proposed payload.
            rec = existing.model_copy(
                update={
                    "proposal_json": rec.proposal_json,
                    "current_json": rec.current_json,
                    "confidence": rec.confidence,
                    "model": rec.model,
                }
            )
        elif existing is not None:
            rec = rec.model_copy(update={"created_at": existing.created_at})
        if self.store is None:
            self._mem[rec.id] = rec
        else:
            self.store.upsert_dict(enrichment_proposals, _row(rec))
        return rec

    def upsert_many(self, records: Iterable[EnrichmentProposalRecord]) -> list[EnrichmentProposalRecord]:
        return [self.upsert(r) for r in records]

    def list(
        self,
        *,
        status: str | None = None,
        target_kind: str | None = None,
    ) -> list[EnrichmentProposalRecord]:
        rows = (
            list(self._mem.values())
            if self.store is None
            else [_from_row(r) for r in self.store.fetch_all(enrichment_proposals)]
        )
        out = [
            r
            for r in rows
            if (status is None or r.status == status)
            and (target_kind is None or r.target_kind == target_kind)
        ]
        return sorted(out, key=lambda r: (r.target_kind, r.target_id, r.field, r.prompt_version or ""))

    def decide(
        self,
        pid: str,
        status: str,
        *,
        reviewer: str,
        note: str | None = None,
    ) -> EnrichmentProposalRecord:
        if status not in {"approved", "rejected", "pending", "applied"}:
            raise ValueError(f"invalid status {status!r}")
        rec = self.get(pid)
        if rec is None:
            raise KeyError(pid)
        updated = rec.model_copy(
            update={
                "status": status,
                "reviewer": reviewer,
                "review_note": note,
                "decided_at": utcnow().isoformat(),
                "auto_approved": reviewer.startswith(AUTO_REVIEWER_PREFIX) and status == "approved",
            }
        )
        if self.store is None:
            self._mem[pid] = updated
        else:
            self.store.upsert_dict(enrichment_proposals, _row(updated))
        return updated

    def export_jsonl(self, path: Path | str, records: Sequence[EnrichmentProposalRecord] | None = None) -> int:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        rows = list(records) if records is not None else self.list()
        with path.open("w", encoding="utf-8") as fh:
            for rec in rows:
                fh.write(json.dumps(rec.model_dump(mode="json"), default=str) + "\n")
        return len(rows)


def load_proposals_jsonl(path: Path | str) -> list[EnrichmentProposalRecord]:
    path = Path(path)
    if not path.is_file():
        return []
    out: list[EnrichmentProposalRecord] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            out.append(EnrichmentProposalRecord.model_validate_json(line))
    return out
