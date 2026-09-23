"""Curated behavioural / fit question bank (plan P2.11).

``fixtures/corpus/behavioural_seed.json`` holds ~60 synthesised fit questions
(why banking / PE / this firm, resume, teamwork, failure, leadership, deal
discussion, ethics, pressure, strengths and weaknesses) with answer guidance.

* Questions import as teaching records (``contract_provenance=static_seed``,
  ``product_role=teaching_qa``) — never Glassdoor.
* Answers are ``synthesised_unvalidated`` (generator ``behavioural-seed-v1``)
  and go through the normal validators; rubrics use the STAR / motivation
  templates in ``answers/rubric.py`` (``kind="star"``).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

from ibpe_corpus.canonical.normalise import normalised_hash
from ibpe_corpus.schemas.models import (
    AccessState,
    Answer,
    AnswerProvenance,
    ExtractionClass,
    ExtractedRecord,
    RawArtefact,
    SourceAdapterResult,
    ValidationStatus,
)

ROOT = Path(__file__).resolve().parents[4]
DEFAULT_BEHAVIOURAL_FIXTURE = ROOT / "fixtures" / "corpus" / "behavioural_seed.json"
GENERATOR_VERSION = "behavioural-seed-v1"
PARSER_VERSION = "behavioural-seed-importer-v1"
STAR_SUFFIX = (
    "Structure it with STAR: Situation, Task, Action (the bulk of the answer), Result, "
    "then a brief reflection on what you learned."
)


@dataclass
class BehaviouralItem:
    id: str
    question: str
    concise: str
    category: str
    rubric_type: str
    domain: str
    difficulty: str | None
    guidance: str
    common_mistakes: list[str] = field(default_factory=list)
    follow_ups: list[str] = field(default_factory=list)

    @property
    def expanded(self) -> str:
        parts = [self.concise, self.guidance]
        if self.rubric_type == "star":
            parts.append(STAR_SUFFIX)
        return "\n\n".join(p for p in parts if p)


def _items(payload: Mapping[str, Any]) -> list[BehaviouralItem]:
    categories = payload.get("categories") or {}
    out: list[BehaviouralItem] = []
    for raw in payload.get("questions") or []:
        cat = categories.get(raw.get("category")) or {}
        out.append(
            BehaviouralItem(
                id=str(raw["id"]),
                question=str(raw["question"]).strip(),
                concise=str(raw["concise"]).strip(),
                category=str(raw.get("category") or "behavioural"),
                rubric_type=str(raw.get("rubric_type") or cat.get("rubric_type") or "star"),
                domain=str(raw.get("domain") or cat.get("domain") or "both"),
                difficulty=raw.get("difficulty"),
                guidance=str(cat.get("guidance") or "").strip(),
                common_mistakes=list(raw.get("common_mistakes") or cat.get("common_mistakes") or []),
                follow_ups=list(raw.get("follow_ups") or cat.get("follow_ups") or []),
            )
        )
    return out


def load_behavioural_seed(
    path: Path | str = DEFAULT_BEHAVIOURAL_FIXTURE,
) -> tuple[SourceAdapterResult, list[BehaviouralItem]]:
    """Load the fixture as teaching question records plus answer items."""
    path = Path(path)
    if not path.is_file():
        return (
            SourceAdapterResult(
                access_state=AccessState.NOT_FOUND,
                diagnostics=[f"behavioural seed missing: {path}"],
            ),
            [],
        )
    data = path.read_bytes()
    payload = json.loads(data.decode("utf-8"))
    items = _items(payload)
    art = RawArtefact(
        source_family="static",
        url_or_path=str(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path),
        content_hash=hashlib.sha256(data).hexdigest(),
        parser_version=PARSER_VERSION,
        access_state=AccessState.PUBLIC,
        metadata={
            "fixture_id": payload.get("fixture_id"),
            "fixture_origin": payload.get("fixture_origin"),
            "provenance": payload.get("provenance", "synthesised"),
            "not_glassdoor": True,
        },
    )
    records = [
        ExtractedRecord(
            source_artefact_id=art.id,
            exact_source_text=item.question,
            source_selector_or_span=f"behavioural_seed:{item.id}",
            record_type=ExtractionClass.EXACT_QUESTION,
            extraction_method="behavioural_seed",
            extracted_metadata={
                "seed_item_id": item.id,
                "topic": "behavioral",
                "subtopic": item.category,
                "domain": item.domain,
                "difficulty": item.difficulty,
                "question_type": "behavioral",
                "rubric_type": item.rubric_type,
                "importer": "behavioural_seed",
                "has_source_answer": False,
                "contract_provenance": "static_seed",
                "product_role": "teaching_qa",
                "source_family": "static",
                "not_glassdoor": True,
                "teaching_source": True,
            },
            grounding_confidence=1.0,
        )
        for item in items
    ]
    return (
        SourceAdapterResult(
            artefacts=[art],
            extracted=records,
            access_state=AccessState.PUBLIC,
            diagnostics=[f"loaded {len(items)} behavioural seed questions from {path.name}"],
            metrics={"behavioural_seed_questions": len(items)},
        ),
        items,
    )


def behavioural_answers(
    items: list[BehaviouralItem],
    hash_to_cq: Mapping[str, str],
) -> list[Answer]:
    """Synthesised answers for seed items whose question survived canonicalisation."""
    out: list[Answer] = []
    for item in items:
        cq_id = hash_to_cq.get(normalised_hash(item.question))
        if not cq_id:
            continue
        out.append(
            Answer(
                canonical_question_id=cq_id,
                concise_answer=item.concise,
                expanded_explanation=item.expanded,
                assumptions=["The answer draws on the candidate's own experience"],
                calculation_representation={
                    "topic": "behavioural" if item.rubric_type == "star" else "behavioural_motivation",
                    "rubric_type": item.rubric_type,
                    "category": item.category,
                },
                common_mistakes=list(item.common_mistakes),
                follow_ups=list(item.follow_ups),
                provenance_type=AnswerProvenance.SYNTHESISED_UNVALIDATED,
                source_ids=[],
                generator_version=GENERATOR_VERSION,
                validation_status=ValidationStatus.NOT_RUN,
                confidence=0.7,
                difficulty=item.difficulty,
                references=["Concord behavioural seed (synthesised coaching guidance)"],
            )
        )
    return out
