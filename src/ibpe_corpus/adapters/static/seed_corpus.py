"""Bundled / staged static seed corpus loader."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from ibpe_corpus.schemas.models import (
    AccessState,
    ExtractionClass,
    ExtractedRecord,
    RawArtefact,
    SourceAdapterResult,
)

PARSER_VERSION = "static-seed-importer-v1"
SOURCE_FAMILY = "static"
DEFAULT_STAGING_SEED = Path("data/staging/seed")
DEFAULT_FIXTURE = Path("fixtures/corpus/seed_ib_pe_questions.json")
FIXTURE_ORIGIN = "synthetic_seed"


def _hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _hash_file(path: Path) -> str:
    return _hash_bytes(path.read_bytes())


def ensure_seed_staged(
    *,
    fixture_path: Path | str = DEFAULT_FIXTURE,
    staging_dir: Path | str = DEFAULT_STAGING_SEED,
) -> Path:
    """Copy the bundled fixture into ``data/staging/seed/`` if not already present."""
    fixture_path = Path(fixture_path)
    staging_dir = Path(staging_dir)
    staging_dir.mkdir(parents=True, exist_ok=True)
    dest = staging_dir / fixture_path.name
    if dest.is_file() and fixture_path.is_file():
        if _hash_file(dest) == _hash_file(fixture_path):
            return dest
    if fixture_path.is_file():
        shutil.copy2(fixture_path, dest)
    return dest


def load_seed_corpus(
    path: Path | str | None = None,
    *,
    fixture_path: Path | str = DEFAULT_FIXTURE,
    staging_dir: Path | str = DEFAULT_STAGING_SEED,
    ensure_staged: bool = True,
) -> SourceAdapterResult:
    """Load bundled seed Q&A into ExtractedRecord staging.

    Prefers ``data/staging/seed/`` when present; otherwise stages from
    ``fixtures/corpus/seed_ib_pe_questions.json``. Records are explicitly
    labeled ``fixture_origin: synthetic_seed`` and never claim Glassdoor
    provenance.
    """
    staging_dir = Path(staging_dir)
    fixture_path = Path(fixture_path)

    if path is not None:
        seed_path = Path(path)
    elif (staging_dir / DEFAULT_FIXTURE.name).is_file():
        seed_path = staging_dir / DEFAULT_FIXTURE.name
    elif ensure_staged and fixture_path.is_file():
        seed_path = ensure_seed_staged(fixture_path=fixture_path, staging_dir=staging_dir)
    elif fixture_path.is_file():
        seed_path = fixture_path
    else:
        return SourceAdapterResult(
            access_state=AccessState.NOT_FOUND,
            diagnostics=["seed corpus fixture not found"],
            metrics={"exact_questions": 0, "source_answers": 0},
        )

    if not seed_path.is_file():
        return SourceAdapterResult(
            access_state=AccessState.NOT_FOUND,
            diagnostics=[f"seed path missing: {seed_path}"],
            metrics={"exact_questions": 0, "source_answers": 0},
        )

    raw = seed_path.read_bytes()
    digest = _hash_bytes(raw)
    payload = json.loads(raw.decode("utf-8"))
    items = payload.get("questions") if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        return SourceAdapterResult(
            access_state=AccessState.PUBLIC,
            diagnostics=["seed JSON missing questions list"],
            metrics={"exact_questions": 0, "source_answers": 0},
        )

    art = RawArtefact(
        source_family=SOURCE_FAMILY,
        url_or_path=str(seed_path),
        raw_json_path=str(seed_path),
        content_hash=digest,
        parser_version=PARSER_VERSION,
        access_state=AccessState.PUBLIC,
        session_class="offline",
        metadata={
            "fixture_origin": payload.get("fixture_origin", FIXTURE_ORIGIN)
            if isinstance(payload, dict)
            else FIXTURE_ORIGIN,
            "provenance": "synthetic_seed",
            "not_glassdoor": True,
            "source_family": SOURCE_FAMILY,
        },
    )

    extracted: list[ExtractedRecord] = []
    q_count = 0
    a_count = 0
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        question = (item.get("question") or "").strip()
        answer = (item.get("answer") or "").strip()
        if not question:
            continue
        pair_id = item.get("id") or f"seed_{idx + 1:03d}"
        meta_base: dict[str, Any] = {
            "pair_id": pair_id,
            "topic": item.get("topic"),
            "domain": item.get("domain"),
            "difficulty": item.get("difficulty"),
            "fixture_origin": FIXTURE_ORIGIN,
            "provenance": "synthetic_seed",
            "not_glassdoor": True,
            "source_family": SOURCE_FAMILY,
            "importer": "static_seed",
        }
        q_rec = ExtractedRecord(
            source_artefact_id=art.id,
            exact_source_text=question,
            source_selector_or_span=f"seed/{pair_id}/question",
            record_type=ExtractionClass.EXACT_QUESTION,
            extraction_method="static_seed_json",
            extracted_metadata={**meta_base, "has_source_answer": bool(answer)},
            grounding_confidence=1.0,
        )
        extracted.append(q_rec)
        q_count += 1
        if answer:
            a_rec = ExtractedRecord(
                source_artefact_id=art.id,
                exact_source_text=answer,
                source_selector_or_span=f"seed/{pair_id}/answer",
                record_type=ExtractionClass.SOURCE_PROVIDED_ANSWER,
                extraction_method="static_seed_json",
                extracted_metadata={
                    **meta_base,
                    "question_record_id": q_rec.id,
                    "answer_provenance": "source_provided",
                },
                grounding_confidence=1.0,
            )
            q_rec.extracted_metadata["answer_record_id"] = a_rec.id
            extracted.append(a_rec)
            a_count += 1

    return SourceAdapterResult(
        artefacts=[art],
        extracted=extracted,
        access_state=AccessState.PUBLIC,
        diagnostics=[f"loaded seed corpus from {seed_path}"],
        metrics={"exact_questions": q_count, "source_answers": a_count},
    )


class StaticSeedAdapter:
    """SourceAdapter for the offline synthetic seed corpus."""

    name = "static"

    def __init__(
        self,
        *,
        fixture_path: Path | str = DEFAULT_FIXTURE,
        staging_dir: Path | str = DEFAULT_STAGING_SEED,
    ) -> None:
        self.fixture_path = Path(fixture_path)
        self.staging_dir = Path(staging_dir)

    def discover(self, config: dict | None = None) -> list[dict]:
        cfg = config or {}
        path = cfg.get("path") or str(self.staging_dir / self.fixture_path.name)
        return [
            {
                "path": path,
                "fixture_path": str(cfg.get("fixture_path", self.fixture_path)),
                "format": "seed_json",
            }
        ]

    def fetch(self, target: dict) -> SourceAdapterResult:
        dest = ensure_seed_staged(
            fixture_path=target.get("fixture_path", self.fixture_path),
            staging_dir=self.staging_dir,
        )
        digest = _hash_file(dest)
        art = RawArtefact(
            source_family=SOURCE_FAMILY,
            url_or_path=str(dest),
            raw_json_path=str(dest),
            content_hash=digest,
            parser_version=PARSER_VERSION,
            access_state=AccessState.PUBLIC,
            session_class="offline",
            metadata={
                "fixture_origin": FIXTURE_ORIGIN,
                "provenance": "synthetic_seed",
                "not_glassdoor": True,
                "staging_path": str(dest),
            },
        )
        return SourceAdapterResult(
            artefacts=[art],
            access_state=AccessState.PUBLIC,
            diagnostics=[f"staged seed at {dest}"],
            metrics={"pages_fetched": 1},
        )

    def parse_artefact(self, artefact: RawArtefact) -> SourceAdapterResult:
        path = Path(
            artefact.metadata.get("staging_path")
            or artefact.raw_json_path
            or artefact.url_or_path
        )
        return load_seed_corpus(path, ensure_staged=False)
