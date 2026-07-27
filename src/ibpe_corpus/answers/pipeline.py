"""Layered answer fill: source → corpus match → synthesise → validate."""

from __future__ import annotations

from typing import Sequence

from ibpe_corpus.answers.generate import generate_answer
from ibpe_corpus.answers.ingest_source import ingest_question_response
from ibpe_corpus.answers.match_corpus import build_corpus_pairs, find_corpus_match
from ibpe_corpus.answers.validate import validate_answer
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    CanonicalQuestion,
    QuestionResponse,
)


def fill_answers(
    canonical_questions: Sequence[CanonicalQuestion],
    existing_answers: Sequence[Answer],
    source_responses: Sequence[QuestionResponse],
    corpus_answers: Sequence[Answer],
) -> list[Answer]:
    """Fill answers for canonical questions using a layered strategy.

    Order per unanswered question:
    1. Source-provided ingest from ``source_responses``
    2. High-confidence corpus match (hash / rapidfuzz)
    3. Deterministic synthesis
    4. Validation (updates synthesised provenance)

    Existing answers for a canonical id are preserved (not overwritten).
    """
    by_q: dict[str, Answer] = {}
    for ans in existing_answers:
        # Prefer first existing; caller owns dedup policy upstream.
        by_q.setdefault(ans.canonical_question_id, ans)

    responses_by_q: dict[str, list[QuestionResponse]] = {}
    for resp in source_responses:
        responses_by_q.setdefault(resp.question_id, []).append(resp)

    # Corpus pairs: prefer questions that already have corpus answers.
    # Include all canonical questions so fuzzy reuse can map across near-duplicates.
    corpus_pairs = build_corpus_pairs(canonical_questions, corpus_answers)
    # Also allow corpus answers whose questions are only represented via existing_answers
    # ids already in canonical_questions (handled by build_corpus_pairs).

    output: list[Answer] = []

    for cq in canonical_questions:
        if cq.id in by_q:
            output.append(by_q[cq.id])
            continue

        filled: Answer | None = None

        # Layer 1 — source
        for resp in responses_by_q.get(cq.id, []):
            ingested = ingest_question_response(
                resp, canonical_question_id=cq.id
            )
            if ingested is not None:
                filled = ingested
                break

        # Layer 2 — corpus match (strict threshold inside find_corpus_match)
        if filled is None and corpus_pairs:
            # Exclude pairs whose answer targets this same id without content reuse need
            match = find_corpus_match(cq, corpus_pairs)
            if match is not None:
                filled = match.answer

        # Direct corpus hit: answer already keyed to this canonical id
        if filled is None:
            for ans in corpus_answers:
                if ans.canonical_question_id == cq.id and (
                    ans.concise_answer or ans.expanded_explanation
                ):
                    filled = ans.model_copy(
                        update={
                            "provenance_type": AnswerProvenance.CORPUS_MATCHED,
                            "canonical_question_id": cq.id,
                        }
                    )
                    break

        # Layer 3 — synthesise
        if filled is None:
            filled = generate_answer(cq)

        # Layer 4 — validate (especially synthesised)
        filled = validate_answer(filled)
        by_q[cq.id] = filled
        output.append(filled)

    return output
