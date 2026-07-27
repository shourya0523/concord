"""JSON interview question bank: load, merge, save, and query."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

BANK_VERSION = 1
DEFAULT_BANK_PATH = Path(__file__).resolve().parent.parent / "data" / "question_bank.json"

# Fields we may fill in later on a re-scrape (blurred process text, etc.).
_UPDATABLE_FIELDS = (
    "date_posted",
    "user",
    "experience",
    "process",
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def make_question_id(company: str, position: str, question: str) -> str:
    raw = f"{company}|{position}|{question.strip().lower()}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def empty_bank() -> dict[str, Any]:
    return {
        "version": BANK_VERSION,
        "updated_at": _utc_now_iso(),
        "completed_jobs": [],
        "questions": [],
    }


def load_bank(path: Path | str = DEFAULT_BANK_PATH) -> dict[str, Any]:
    bank_path = Path(path)
    if not bank_path.exists():
        return empty_bank()
    with bank_path.open(encoding="utf-8") as f:
        data = json.load(f)
    if "questions" not in data:
        data["questions"] = []
    if "completed_jobs" not in data:
        data["completed_jobs"] = []
    if "version" not in data:
        data["version"] = BANK_VERSION
    return data


def save_bank(bank: dict[str, Any], path: Path | str = DEFAULT_BANK_PATH) -> None:
    bank_path = Path(path)
    bank_path.parent.mkdir(parents=True, exist_ok=True)
    bank["version"] = bank.get("version", BANK_VERSION)
    bank.setdefault("completed_jobs", [])
    bank["updated_at"] = _utc_now_iso()
    with bank_path.open("w", encoding="utf-8") as f:
        json.dump(bank, f, indent=2, ensure_ascii=False)
        f.write("\n")


def job_key(company: str, position: str) -> str:
    return f"{company}|{position}"


def is_job_completed(bank: dict[str, Any], company: str, position: str) -> bool:
    key = job_key(company, position)
    for job in bank.get("completed_jobs", []):
        if isinstance(job, str) and job == key:
            return True
        if (
            isinstance(job, dict)
            and job.get("company") == company
            and job.get("position") == position
        ):
            return True
    return False


def mark_job_completed(
    bank: dict[str, Any],
    company: str,
    position: str,
    track: str = "",
) -> dict[str, Any]:
    if is_job_completed(bank, company, position):
        return bank
    bank.setdefault("completed_jobs", []).append(
        {
            "company": company,
            "position": position,
            "track": track,
            "completed_at": _utc_now_iso(),
        }
    )
    return bank


def clear_job_completed(
    bank: dict[str, Any], company: str, position: str
) -> dict[str, Any]:
    """Remove a completed-job marker so the job can be re-scraped."""
    key = job_key(company, position)
    bank["completed_jobs"] = [
        job
        for job in bank.get("completed_jobs", [])
        if not (
            (isinstance(job, str) and job == key)
            or (
                isinstance(job, dict)
                and job.get("company") == company
                and job.get("position") == position
            )
        )
    ]
    return bank


def enrich_question(
    raw: dict[str, Any],
    company: str,
    track: str,
    position: str,
    scraped_at: Optional[str] = None,
) -> dict[str, Any]:
    question_text = (raw.get("question") or "").strip()
    scraped = scraped_at or _utc_now_iso()
    return {
        "id": make_question_id(company, position, question_text),
        "company": company,
        "track": track,
        "position": position,
        "date_posted": raw.get("date_posted") or "",
        "user": raw.get("user") or "",
        "experience": raw.get("experience") or "",
        "process": raw.get("process") or "",
        "question": question_text,
        "scraped_at": scraped,
    }


def merge_questions(
    bank: dict[str, Any], records: list[dict[str, Any]]
) -> tuple[dict[str, Any], int, int]:
    """Merge records into bank by id.

    Returns (bank, num_added, num_updated).
    Existing rows are updated when a re-scrape fills empty fields
    (e.g. blurred process text).
    """
    by_id = {
        q.get("id"): q for q in bank.get("questions", []) if q.get("id")
    }
    added = 0
    updated = 0
    for record in records:
        record_id = record.get("id")
        if not record_id or not record.get("question"):
            continue
        existing = by_id.get(record_id)
        if existing is None:
            bank.setdefault("questions", []).append(record)
            by_id[record_id] = record
            added += 1
            continue

        changed = False
        for field in _UPDATABLE_FIELDS:
            new_val = (record.get(field) or "").strip()
            old_val = (existing.get(field) or "").strip()
            # Fill empties, or replace short labels with longer process text.
            if new_val and (not old_val or len(new_val) > len(old_val) + 20):
                if new_val != old_val:
                    existing[field] = new_val
                    changed = True
        if changed:
            existing["scraped_at"] = record.get("scraped_at") or existing.get(
                "scraped_at"
            )
            updated += 1
    return bank, added, updated


def query_bank(
    bank: dict[str, Any],
    track: Optional[str] = None,
    company: Optional[str] = None,
    position: Optional[str] = None,
) -> list[dict[str, Any]]:
    results = bank.get("questions", [])
    if track:
        track_lower = track.lower()
        results = [q for q in results if (q.get("track") or "").lower() == track_lower]
    if company:
        company_lower = company.lower()
        results = [
            q for q in results if company_lower in (q.get("company") or "").lower()
        ]
    if position:
        position_lower = position.lower()
        results = [
            q for q in results if position_lower in (q.get("position") or "").lower()
        ]
    return results
