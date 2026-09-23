"""Answer depth (plan P2.4): proposals to expand shallow source answers.

Source answers whose expanded explanation equals the concise answer are tagged
``needs_expansion`` by the validator. Appending synthesised text to a
``source_provided`` answer would mix provenance, so expansions are *proposals*
(``target_kind="answer"``, ``field="expanded_explanation"``): the topic
handler's deterministic explanation is offered as an appendix, labelled
``synthesised_validated``, and applied only after an editor approves it
(publish-teaching applies approved proposals). With a Gemini key, the same
queue can be filled by ``enrich-v1`` rewrites.
"""

from __future__ import annotations

from typing import Sequence

from ibpe_corpus import GENERATOR_VERSION
from ibpe_corpus.answers.generate import generate_answer, route_topic
from ibpe_corpus.answers.proposals import proposal_id
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    CanonicalQuestion,
    EnrichmentProposalRecord,
)

EXPANSION_PROMPT_VERSION = "expand-heuristic-v1"


def propose_expansions(
    answers: Sequence[Answer],
    questions: Sequence[CanonicalQuestion],
) -> list[EnrichmentProposalRecord]:
    by_id = {q.id: q for q in questions}
    out: list[EnrichmentProposalRecord] = []
    for ans in answers:
        if "needs_expansion" not in ans.quality_tags:
            continue
        if ans.provenance_type not in {AnswerProvenance.SOURCE_PROVIDED, AnswerProvenance.CORPUS_MATCHED}:
            continue
        q = by_id.get(ans.canonical_question_id)
        if q is None:
            continue
        topic_key = route_topic(q)
        if topic_key in {"generic", "behavioural"}:
            continue
        synth = generate_answer(q)
        appendix = synth.expanded_explanation.strip()
        if not appendix or appendix in ans.expanded_explanation:
            continue
        value = f"{ans.expanded_explanation.strip()}\n\n{appendix}"
        out.append(
            EnrichmentProposalRecord(
                id=proposal_id("answer", ans.id, "expanded_explanation", EXPANSION_PROMPT_VERSION),
                target_kind="answer",
                target_id=ans.id,
                field="expanded_explanation",
                proposal_json={
                    "value": value,
                    "appendix": appendix,
                    "appendix_provenance": "synthesised_validated",
                    "appendix_generator": GENERATOR_VERSION,
                    "topic_handler": topic_key,
                    "canonical_question_id": ans.canonical_question_id,
                },
                current_json={"value": ans.expanded_explanation},
                model=GENERATOR_VERSION,
                prompt_version=EXPANSION_PROMPT_VERSION,
                confidence=0.5,
                status="pending",
                auto_approved=False,
                review_note="Synthesised appendix for a short source answer — editor approval required",
            )
        )
    return out
