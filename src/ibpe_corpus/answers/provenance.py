"""Provenance rules for answers and Gemini enrichment.

Invariants (enforced in code, not just docs):

1. Corpus / GitHub ``source_provided`` answers are preferred over synthesis.
2. Gemini (and other LLM) output is always labelled synthesised / enrichment —
   never ``source_provided``, never Glassdoor, never a GitHub path that lacked
   the text.
3. Glassdoor text is firm-signal only; never promoted to teaching answers here.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Iterable

from ibpe_corpus.schemas.models import Answer, AnswerProvenance

# Product-facing enrichment provenance (aligns with contracts ProvenanceEnum).
FORBIDDEN_GEMINI_ATTRIBUTIONS = frozenset(
    {
        "glassdoor",
        "glassdoor_occurrence",
        "github_source",
        "source_provided",
        "imported",
        "static_seed",
    }
)

ALLOWED_SYNTHESIS_PROVENANCE = frozenset(
    {
        AnswerProvenance.SYNTHESISED_UNVALIDATED,
        AnswerProvenance.SYNTHESISED_VALIDATED,
        AnswerProvenance.NEEDS_REVIEW,
        AnswerProvenance.REJECTED,
    }
)


class EnrichmentProvenance(str, Enum):
    """Labels for Gemini enrichment artefacts (not teaching answer origins)."""

    GEMINI_SYNTHESISED = "gemini_synthesised"
    EDITORIAL = "editorial"
    DETERMINISTIC_CALCULATION = "deterministic_calculation"


class ProvenanceError(ValueError):
    """Raised when an attribution would launder Gemini/editorial as corpus source."""


def assert_not_source_laundering(
    *,
    provenance: str,
    generator_version: str | None = None,
    model_version: str | None = None,
    claimed_github_path: str | None = None,
    github_path_contained_text: bool | None = None,
) -> None:
    """Fail closed if synthesised/enrichment output is attributed to corpus sources.

    Call before publishing any Gemini or editorial artefact.
    """
    lowered = (provenance or "").strip().lower()
    is_model_output = bool(generator_version) or bool(model_version)

    if is_model_output and lowered in FORBIDDEN_GEMINI_ATTRIBUTIONS:
        raise ProvenanceError(
            f"Refusing to attribute model/editorial output as {provenance!r}. "
            "Use gemini_synthesised / synthesised_* / editorial instead."
        )

    if claimed_github_path and github_path_contained_text is False:
        raise ProvenanceError(
            f"Refusing to attribute content to GitHub path {claimed_github_path!r} "
            "that did not contain this text."
        )

    if lowered in {"glassdoor", "glassdoor_occurrence"} and is_model_output:
        raise ProvenanceError(
            "Never attribute Gemini output to Glassdoor."
        )


def enforce_answer_provenance(answer: Answer) -> Answer:
    """Return a copy with provenance corrected if synthesis was mislabelled.

    - Any answer with ``generator_version`` cannot be ``source_provided``.
    - Synthesised provenance must stay in the synthesis family.
    """
    provenance = answer.provenance_type

    if answer.generator_version and provenance == AnswerProvenance.SOURCE_PROVIDED:
        provenance = AnswerProvenance.NEEDS_REVIEW

    if answer.generator_version and provenance == AnswerProvenance.CORPUS_MATCHED:
        # Corpus match must come from existing corpus rows, not a generator.
        provenance = AnswerProvenance.SYNTHESISED_UNVALIDATED

    if (
        provenance
        in {
            AnswerProvenance.SYNTHESISED_UNVALIDATED,
            AnswerProvenance.SYNTHESISED_VALIDATED,
        }
        and provenance not in ALLOWED_SYNTHESIS_PROVENANCE
    ):
        raise ProvenanceError(f"Illegal synthesis provenance: {provenance}")

    assert_not_source_laundering(
        provenance=provenance.value,
        generator_version=answer.generator_version,
    )

    if provenance != answer.provenance_type:
        return answer.model_copy(update={"provenance_type": provenance})
    return answer


def label_enrichment_record(
    record: dict[str, Any],
    *,
    model_version: str,
    prompt_version: str,
) -> dict[str, Any]:
    """Stamp enrichment staging records with mandatory provenance metadata."""
    out = dict(record)
    provenance = EnrichmentProvenance.GEMINI_SYNTHESISED.value
    assert_not_source_laundering(
        provenance=provenance,
        model_version=model_version,
        claimed_github_path=out.get("claimed_github_path"),
        github_path_contained_text=out.get("github_path_contained_text"),
    )
    out["provenance"] = provenance
    out["product_role"] = "enrichment"
    out["model_version"] = model_version
    out["prompt_version"] = prompt_version
    # Strip any accidental Glassdoor/GitHub answer attribution keys.
    for bad in ("glassdoor_answer_id", "github_answer_path_as_source"):
        out.pop(bad, None)
    return out


def prefer_corpus_over_synthesis(
    existing: Answer | None,
    synthesised: Answer | None,
) -> Answer | None:
    """Corpus/GitHub answers win; synthesis only fills gaps."""
    if existing is not None and existing.provenance_type in {
        AnswerProvenance.SOURCE_PROVIDED,
        AnswerProvenance.CORPUS_MATCHED,
        AnswerProvenance.SYNTHESISED_VALIDATED,
    }:
        if existing.provenance_type != AnswerProvenance.REJECTED:
            return enforce_answer_provenance(existing)
    if synthesised is not None:
        return enforce_answer_provenance(synthesised)
    if existing is not None:
        return enforce_answer_provenance(existing)
    return None


def collect_provenance_violations(answers: Iterable[Answer]) -> list[str]:
    """Scan answers for provenance rule breaches (report / CI helper)."""
    violations: list[str] = []
    for ans in answers:
        if ans.generator_version and ans.provenance_type == AnswerProvenance.SOURCE_PROVIDED:
            violations.append(
                f"{ans.id}: generator_version set but provenance=source_provided"
            )
        if ans.provenance_type == AnswerProvenance.SOURCE_PROVIDED and not ans.source_ids:
            violations.append(
                f"{ans.id}: source_provided without source_ids"
            )
    return violations
