"""Import legacy GlassCleaner ``data/question_bank.json`` into corpus records."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from ibpe_corpus.schemas.models import (
    AccessState,
    ExtractionClass,
    ExtractedRecord,
    RawArtefact,
    SourceAdapterResult,
)

PARSER_VERSION = "question-bank-importer-v1"
SOURCE_FAMILY = "glassdoor_question_bank"
DEFAULT_BANK_PATH = Path("data/question_bank.json")

_LEADING_NUM_RE = re.compile(r"^\s*\d+\.\s*")


def _hash_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _clean_question(text: str) -> str:
    text = (text or "").strip()
    text = _LEADING_NUM_RE.sub("", text).strip()
    return text


def import_question_bank(
    path: Path | str = DEFAULT_BANK_PATH,
    *,
    tracks: set[str] | None = None,
) -> SourceAdapterResult:
    """Convert GlassCleaner question bank rows into ExtractedRecord staging.

    Source provenance is ``glassdoor_question_bank`` (legacy scraper output),
    not live Glassdoor HTML. Exact question wording is preserved.
    """
    path = Path(path)
    if not path.is_file():
        return SourceAdapterResult(
            access_state=AccessState.NOT_FOUND,
            diagnostics=[f"question bank not found: {path}"],
            metrics={"exact_questions": 0},
        )

    payload = json.loads(path.read_text(encoding="utf-8"))
    items = payload.get("questions") if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        return SourceAdapterResult(
            access_state=AccessState.PUBLIC,
            diagnostics=["question bank missing questions list"],
            metrics={"exact_questions": 0},
        )

    art = RawArtefact(
        source_family=SOURCE_FAMILY,
        url_or_path=str(path),
        raw_json_path=str(path),
        content_hash=_hash_file(path),
        parser_version=PARSER_VERSION,
        access_state=AccessState.PUBLIC,
        session_class="legacy_scraper_bank",
        metadata={
            "bank_version": payload.get("version") if isinstance(payload, dict) else None,
            "updated_at": payload.get("updated_at") if isinstance(payload, dict) else None,
            "importer": "question_bank",
        },
    )

    extracted: list[ExtractedRecord] = []
    track_counts: dict[str, int] = {}
    skipped = 0

    for item in items:
        if not isinstance(item, dict):
            skipped += 1
            continue
        track = str(item.get("track") or "").upper() or "UNKNOWN"
        if tracks is not None and track not in tracks:
            continue
        question = _clean_question(str(item.get("question") or ""))
        if not question or len(question) < 3:
            skipped += 1
            continue

        company = item.get("company")
        position = item.get("position")
        meta: dict[str, Any] = {
            "bank_question_id": item.get("id"),
            "employer": company,
            "role": position,
            "track": track,
            "domain": "pe" if track == "PE" else ("ib" if track == "IB" else "other"),
            "interview_date": item.get("date_posted") or None,
            "scraped_at": item.get("scraped_at"),
            "process": item.get("process") or None,
            "experience": item.get("experience") or None,
            "user": item.get("user") or None,
            "importer": "question_bank",
            "source_family": SOURCE_FAMILY,
        }
        extracted.append(
            ExtractedRecord(
                source_artefact_id=art.id,
                exact_source_text=question,
                source_selector_or_span=f"question_bank/{item.get('id')}/question",
                record_type=ExtractionClass.EXACT_QUESTION,
                extraction_method="question_bank_json",
                extracted_metadata=meta,
                grounding_confidence=0.95,
            )
        )
        track_counts[track] = track_counts.get(track, 0) + 1

        process = (item.get("process") or "").strip()
        if process and len(process) > 20:
            extracted.append(
                ExtractedRecord(
                    source_artefact_id=art.id,
                    exact_source_text=process,
                    source_selector_or_span=f"question_bank/{item.get('id')}/process",
                    record_type=ExtractionClass.INTERVIEW_FORMAT,
                    extraction_method="question_bank_process",
                    extracted_metadata={
                        **meta,
                        "parent_bank_question_id": item.get("id"),
                    },
                    grounding_confidence=0.7,
                )
            )

    return SourceAdapterResult(
        artefacts=[art],
        extracted=extracted,
        access_state=AccessState.PUBLIC,
        diagnostics=[
            f"imported question bank from {path}",
            f"tracks={track_counts}",
            f"skipped={skipped}",
        ],
        metrics={
            "exact_questions": sum(
                1 for r in extracted if r.record_type == ExtractionClass.EXACT_QUESTION
            ),
            "interview_format": sum(
                1 for r in extracted if r.record_type == ExtractionClass.INTERVIEW_FORMAT
            ),
            "bank_rows": len(items),
            **{f"track_{k}": v for k, v in track_counts.items()},
        },
    )
