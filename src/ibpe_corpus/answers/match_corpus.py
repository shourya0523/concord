"""Match unanswered questions to existing corpus answers.

Uses normalised-hash exact match first, then rapidfuzz. Answer reuse requires
a stricter similarity threshold than typical question clustering.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from rapidfuzz import fuzz

from ibpe_corpus.answers.normalize import normalise_text, normalised_hash
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    CanonicalQuestion,
    ValidationStatus,
)

# Question clustering often accepts ~85; answer reuse must be stricter.
ANSWER_REUSE_FUZZ_THRESHOLD = 92.0
# Clustering reference (not used for reuse decisions).
QUESTION_CLUSTER_FUZZ_THRESHOLD = 85.0


@dataclass(frozen=True)
class CorpusMatch:
    answer: Answer
    score: float
    method: str  # "normalised_hash" | "rapidfuzz"
    source_question_id: str


def find_corpus_match(
    question: CanonicalQuestion,
    corpus_pairs: Sequence[tuple[CanonicalQuestion, Answer]],
    *,
    fuzz_threshold: float = ANSWER_REUSE_FUZZ_THRESHOLD,
) -> CorpusMatch | None:
    """Find a high-confidence corpus answer for ``question``.

    Only returns a match when confidence is high enough to treat the questions
    as the same canonical item (exact hash or fuzz ≥ threshold).
    """
    if not corpus_pairs:
        return None

    q_hash = question.normalised_hash or normalised_hash(question.canonical_wording)
    q_norm = normalise_text(question.canonical_wording)

    # Pass 1: exact normalised hash
    for cq, ans in corpus_pairs:
        if not ans.concise_answer and not ans.expanded_explanation:
            continue
        other_hash = cq.normalised_hash or normalised_hash(cq.canonical_wording)
        if other_hash and other_hash == q_hash:
            return CorpusMatch(
                answer=_rebadge_corpus_answer(ans, question.id),
                score=100.0,
                method="normalised_hash",
                source_question_id=cq.id,
            )

    # Pass 2: rapidfuzz (stricter than clustering)
    best: CorpusMatch | None = None
    for cq, ans in corpus_pairs:
        if not ans.concise_answer and not ans.expanded_explanation:
            continue
        other_norm = normalise_text(cq.canonical_wording)
        if not other_norm or not q_norm:
            continue
        score = float(fuzz.token_set_ratio(q_norm, other_norm))
        if score < fuzz_threshold:
            continue
        if best is None or score > best.score:
            best = CorpusMatch(
                answer=_rebadge_corpus_answer(ans, question.id),
                score=score,
                method="rapidfuzz",
                source_question_id=cq.id,
            )

    return best


def _rebadge_corpus_answer(source: Answer, canonical_question_id: str) -> Answer:
    """Clone corpus answer onto the target question with CORPUS_MATCHED provenance."""
    return Answer(
        canonical_question_id=canonical_question_id,
        concise_answer=source.concise_answer,
        expanded_explanation=source.expanded_explanation,
        assumptions=list(source.assumptions),
        calculation_representation=(
            dict(source.calculation_representation)
            if source.calculation_representation
            else None
        ),
        common_mistakes=list(source.common_mistakes),
        follow_ups=list(source.follow_ups),
        provenance_type=AnswerProvenance.CORPUS_MATCHED,
        source_ids=list(dict.fromkeys([*source.source_ids, source.id])),
        generator_version=None,
        validator_version=None,
        validation_status=ValidationStatus.NOT_RUN,
        confidence=min(0.95, max(0.7, float(source.confidence))),
        difficulty=source.difficulty,
        references=list(source.references),
    )


def build_corpus_pairs(
    questions: Sequence[CanonicalQuestion],
    answers: Sequence[Answer],
) -> list[tuple[CanonicalQuestion, Answer]]:
    """Pair answers to their canonical questions for matching."""
    by_id = {q.id: q for q in questions}
    pairs: list[tuple[CanonicalQuestion, Answer]] = []
    for ans in answers:
        cq = by_id.get(ans.canonical_question_id)
        if cq is not None:
            pairs.append((cq, ans))
    return pairs
