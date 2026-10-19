"""Load licensed guide PDFs from config + data/guides/."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import yaml

from ibpe_corpus.adapters.guides.parse import (
    PARSER_VERSION,
    parse_guide_qa_pairs,
    stable_pair_id,
)
from ibpe_corpus.schemas.models import (
    AccessState,
    CorpusProvenance,
    ExtractionClass,
    ExtractedRecord,
    ProductRole,
    RawArtefact,
    SourceAdapterResult,
)

ROOT = Path(__file__).resolve().parents[4]
DEFAULT_CONFIG = ROOT / "config" / "guide_sources.yml"
DEFAULT_GUIDES_DIR = ROOT / "data" / "guides"
DEFAULT_STAGING = ROOT / "data" / "staging" / "guides"


def _hash_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_config(path: Path | None = None) -> list[dict[str, Any]]:
    cfg_path = path or DEFAULT_CONFIG
    if not cfg_path.is_file():
        return []
    data = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
    return list(data.get("guides") or [])


def _extract_pdf_text(path: Path) -> str:
    try:
        import pymupdf
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("pymupdf required for guide PDF ingest") from exc
    doc = pymupdf.open(str(path))
    chunks: list[str] = []
    for page in doc:
        chunks.append(page.get_text())
    return "\n".join(chunks)


def load_guide(
    *,
    guide_id: str | None = None,
    pdf_path: Path | str | None = None,
    config_path: Path | str | None = None,
    guides_dir: Path | str = DEFAULT_GUIDES_DIR,
) -> SourceAdapterResult:
    """Load one guide by config id or explicit PDF path."""
    guides_dir = Path(guides_dir)
    entries = _load_config(Path(config_path) if config_path else None)
    entry: dict[str, Any] | None = None
    if guide_id:
        for e in entries:
            if e.get("id") == guide_id:
                entry = e
                break
        if entry is None:
            return SourceAdapterResult(
                access_state=AccessState.NOT_FOUND,
                diagnostics=[f"guide id not in config: {guide_id}"],
            )
        pdf_path = guides_dir / str(entry["filename"])
    elif pdf_path is not None:
        pdf_path = Path(pdf_path)
        for e in entries:
            if e.get("filename") == pdf_path.name:
                entry = e
                break
        if entry is None:
            entry = {
                "id": pdf_path.stem,
                "title": pdf_path.stem,
                "provenance": CorpusProvenance.LICENSED_GUIDE.value,
                "product_role": ProductRole.TEACHING_QA.value,
                "domain": "ib",
                "priority": 99,
            }
    else:
        return SourceAdapterResult(
            access_state=AccessState.NOT_FOUND,
            diagnostics=["guide_id or pdf_path required"],
        )

    pdf_path = Path(pdf_path)
    if not pdf_path.is_file():
        return SourceAdapterResult(
            access_state=AccessState.NOT_FOUND,
            diagnostics=[f"guide PDF missing: {pdf_path}"],
        )

    content_hash = _hash_file(pdf_path)
    expected = entry.get("content_hash")
    if expected and expected != content_hash:
        return SourceAdapterResult(
            access_state=AccessState.UNKNOWN,
            diagnostics=[
                f"content_hash mismatch for {entry.get('id')}: expected {expected[:12]}… got {content_hash[:12]}…"
            ],
        )

    source_id = str(entry.get("id") or pdf_path.stem)
    text = _extract_pdf_text(pdf_path)
    pairs = parse_guide_qa_pairs(text, source_id=source_id)

    staging = DEFAULT_STAGING
    staging.mkdir(parents=True, exist_ok=True)
    staging_json = staging / f"{source_id}.json"
    staging_json.write_text(json.dumps(pairs, indent=2), encoding="utf-8")

    artefact = RawArtefact(
        source_family="licensed_guide",
        url_or_path=str(pdf_path),
        content_hash=content_hash,
        parser_version=PARSER_VERSION,
        access_state=AccessState.PUBLIC,
        metadata={
            "guide_id": source_id,
            "title": entry.get("title"),
            "staging_path": str(staging_json),
            "pair_count": len(pairs),
        },
    )

    provenance = str(entry.get("provenance") or CorpusProvenance.LICENSED_GUIDE.value)
    product_role = str(entry.get("product_role") or ProductRole.TEACHING_QA.value)
    domain = str(entry.get("domain") or "ib")
    priority = int(entry.get("priority") or 99)

    extracted: list[ExtractedRecord] = []
    for pair in pairs:
        pair_id = stable_pair_id(source_id, pair["question"])
        q_meta = {
            "pair_id": pair_id,
            "source_id": source_id,
            "guide_id": source_id,
            "contract_provenance": provenance,
            "product_role": product_role,
            "source_family": "licensed_guide",
            "teaching_source": True,
            "domain": domain,
            "topic": pair.get("topic"),
            "section": pair.get("section"),
            "question_number": pair.get("number"),
            "guide_priority": priority,
            "not_glassdoor": True,
            "answer_provenance": "source_provided",
        }
        extracted.append(
            ExtractedRecord(
                source_artefact_id=artefact.id,
                exact_source_text=pair["question"],
                record_type=ExtractionClass.EXACT_QUESTION,
                extraction_method="guide_pdf_numbered_q",
                extracted_metadata=q_meta,
            )
        )
        a_meta = dict(q_meta)
        a_meta["question_text"] = pair["question"]
        extracted.append(
            ExtractedRecord(
                source_artefact_id=artefact.id,
                exact_source_text=pair["answer"],
                record_type=ExtractionClass.SOURCE_PROVIDED_ANSWER,
                extraction_method="guide_pdf_numbered_a",
                extracted_metadata=a_meta,
            )
        )

    return SourceAdapterResult(
        artefacts=[artefact],
        extracted=extracted,
        access_state=AccessState.PUBLIC,
        metrics={
            "exact_questions": len(pairs),
            "source_answers": len(pairs),
        },
    )


def load_all_guides(
    *,
    config_path: Path | str | None = None,
    guides_dir: Path | str = DEFAULT_GUIDES_DIR,
) -> SourceAdapterResult:
    """Load every guide listed in config; merge extracted records."""
    entries = _load_config(Path(config_path) if config_path else None)
    if not entries:
        return SourceAdapterResult(
            access_state=AccessState.NOT_FOUND,
            diagnostics=["no guides in config"],
        )

    all_artefacts: list[RawArtefact] = []
    all_extracted: list[ExtractedRecord] = []
    diagnostics: list[str] = []
    total_q = 0

    for entry in sorted(entries, key=lambda e: int(e.get("priority") or 99)):
        gid = entry.get("id")
        if not gid:
            continue
        result = load_guide(guide_id=str(gid), config_path=config_path, guides_dir=guides_dir)
        diagnostics.extend(result.diagnostics)
        if result.access_state == AccessState.NOT_FOUND:
            continue
        all_artefacts.extend(result.artefacts)
        all_extracted.extend(result.extracted)
        total_q += int(result.metrics.get("exact_questions") or 0)

    return SourceAdapterResult(
        artefacts=all_artefacts,
        extracted=all_extracted,
        access_state=AccessState.PUBLIC if all_extracted else AccessState.NOT_FOUND,
        diagnostics=diagnostics,
        metrics={
            "exact_questions": total_q,
            "source_answers": total_q,
            "guides_loaded": len(all_artefacts),
        },
    )
