"""Import legacy GlassCleaner ``data/question_bank.json`` as firm signals only.

Teaching Q/A truth comes from GitHub / static corpora. The bank supplies
directional firm preferences (employer × role × wording) via topic signals and
interview occurrences — never authoritative answers.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from ibpe_corpus.canonical.publish_gate import is_interview_process_placeholder
from ibpe_corpus.schemas.models import (
    AccessState,
    ExtractionClass,
    ExtractedRecord,
    RawArtefact,
    SourceAdapterResult,
)

PARSER_VERSION = "question-bank-importer-v2"
SOURCE_FAMILY = "glassdoor_question_bank"
DEFAULT_BANK_PATH = Path("data/question_bank.json")
CONTRACT_PROVENANCE = "glassdoor_occurrence"
PRODUCT_ROLE = "firm_signal"

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
    """Convert GlassCleaner question bank rows into firm-signal ExtractedRecords.

    - Real interview wordings → ``TOPIC_SIGNAL`` with ``product_role=firm_signal``
    - ``[Interview process]`` placeholders → skipped (never published)
    - Process blurbs → ``INTERVIEW_FORMAT`` (signal metadata only)
    - Never emits ``SOURCE_PROVIDED_ANSWER`` from the bank
    """
    path = Path(path)
    if not path.is_file():
        return SourceAdapterResult(
            access_state=AccessState.NOT_FOUND,
            diagnostics=[f"question bank not found: {path}"],
            metrics={"exact_questions": 0, "topic_signals": 0, "placeholders_rejected": 0},
        )

    payload = json.loads(path.read_text(encoding="utf-8"))
    items = payload.get("questions") if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        return SourceAdapterResult(
            access_state=AccessState.PUBLIC,
            diagnostics=["question bank missing questions list"],
            metrics={"exact_questions": 0, "topic_signals": 0, "placeholders_rejected": 0},
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
            "product_role": PRODUCT_ROLE,
            "contract_provenance": CONTRACT_PROVENANCE,
            "teaching_source": False,
        },
    )

    extracted: list[ExtractedRecord] = []
    track_counts: dict[str, int] = {}
    skipped = 0
    placeholders_rejected = 0

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

        if is_interview_process_placeholder(question):
            placeholders_rejected += 1
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
            "product_role": PRODUCT_ROLE,
            "contract_provenance": CONTRACT_PROVENANCE,
            "teaching_source": False,
            "occurrence_confidence": 0.85,
        }
        extracted.append(
            ExtractedRecord(
                source_artefact_id=art.id,
                exact_source_text=question,
                source_selector_or_span=f"question_bank/{item.get('id')}/question",
                record_type=ExtractionClass.TOPIC_SIGNAL,
                extraction_method="question_bank_json_firm_signal",
                extracted_metadata=meta,
                grounding_confidence=0.85,
            )
        )
        track_counts[track] = track_counts.get(track, 0) + 1

        process = (item.get("process") or "").strip()
        if process and len(process) > 20 and not is_interview_process_placeholder(process):
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

    topic_n = sum(1 for r in extracted if r.record_type == ExtractionClass.TOPIC_SIGNAL)
    return SourceAdapterResult(
        artefacts=[art],
        extracted=extracted,
        access_state=AccessState.PUBLIC,
        diagnostics=[
            f"imported question bank as firm signals from {path}",
            f"tracks={track_counts}",
            f"skipped={skipped}",
            f"placeholders_rejected={placeholders_rejected}",
            "product_role=firm_signal; not teaching Q/A",
        ],
        metrics={
            "exact_questions": 0,
            "topic_signals": topic_n,
            "interview_format": sum(
                1 for r in extracted if r.record_type == ExtractionClass.INTERVIEW_FORMAT
            ),
            "bank_rows": len(items),
            "placeholders_rejected": placeholders_rejected,
            "firm_signals": topic_n,
            **{f"track_{k}": v for k, v in track_counts.items()},
        },
    )
