"""Answer depth (plan P2.4): proposals to expand shallow source answers.

Source answers whose expanded explanation equals the concise answer are tagged
``needs_expansion`` by the validator. Appending synthesised text to a
``source_provided`` answer would mix provenance, so expansions are *proposals*
(``target_kind="answer"``, ``field="expanded_explanation"``): the topic
handler's deterministic explanation is offered as an appendix, labelled
``synthesised_validated``, and applied only after an editor approves it
(publish-teaching applies approved proposals).

With ``OPENROUTER_API_KEY`` the small model (prompt ``expand-v1``) drafts an
appendix **only when required** — for answers whose topic has no deterministic
handler (``generic``), where the heuristic produces nothing. Drafts must pass
:func:`validate_expansion`; a failed small draft escalates once to the primary
tier. Model drafts are always ``pending`` proposals, never auto-applied.
"""

from __future__ import annotations

from typing import Any, Callable, Sequence

from pydantic import BaseModel, Field

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
EXPANSION_LLM_PROMPT_VERSION = "expand-v1"
MIN_APPENDIX_CHARS = 80
MAX_APPENDIX_CHARS = 1500

LlmCall = Callable[[str], dict[str, Any]]


class ExpansionDraft(BaseModel):
    """Structured-output contract for prompt ``expand-v1``."""

    appendix: str = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)


EXPAND_PROMPT = """You extend a short IB/PE interview answer for a learning product.
Write 2-5 sentences that explain the reasoning behind the SOURCE ANSWER. Do not
contradict it, do not invent firm-specific facts, never mention Glassdoor.
Return JSON {{"appendix": str, "confidence": float}}.

QUESTION: {question}
SOURCE ANSWER: {answer}
"""


def validate_expansion(appendix: str, answer: Answer) -> list[str]:
    """Checks a model appendix must pass (empty list = valid)."""
    text = (appendix or "").strip()
    errors: list[str] = []
    if len(text) < MIN_APPENDIX_CHARS:
        errors.append("appendix_too_short")
    if len(text) > MAX_APPENDIX_CHARS:
        errors.append("appendix_too_long")
    if text and text in answer.expanded_explanation:
        errors.append("appendix_duplicate")
    if "glassdoor" in text.lower():
        errors.append("glassdoor_attribution")
    return errors


def _llm_expansion(
    ans: Answer,
    q: CanonicalQuestion,
    steps_calls: list[tuple[Any, LlmCall, str | None]],
) -> tuple[tuple[ExpansionDraft, str | None] | None, str]:
    from ibpe_corpus.answers.llm_client import LlmValidationError, run_tiered

    prompt = EXPAND_PROMPT.format(question=q.canonical_wording, answer=ans.expanded_explanation)

    def step(call: LlmCall, model: str | None) -> Callable[[], tuple[ExpansionDraft, str | None]]:
        def run() -> tuple[ExpansionDraft, str | None]:
            try:
                draft = ExpansionDraft.model_validate(call(prompt))
            except ValueError as exc:  # pydantic ValidationError is a ValueError
                raise LlmValidationError("expand-v1 reply unusable", errors=[str(exc)[:120]]) from None
            errors = validate_expansion(draft.appendix, ans)
            if errors:
                raise LlmValidationError("expand-v1 draft failed validation", errors=errors)
            served = getattr(call, "last_model", None) or model or getattr(call, "model", None)
            return draft, served

        return run

    return run_tiered([(tier, step(call, model)) for tier, call, model in steps_calls])


def propose_expansions(
    answers: Sequence[Answer],
    questions: Sequence[CanonicalQuestion],
    *,
    llm_call: LlmCall | None = None,
    model: str | None = None,
    escalate_call: LlmCall | None = None,
    escalate_model: str | None = None,
    routes: Any | None = None,
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
        if topic_key == "behavioural":
            continue
        if topic_key == "generic":
            # No deterministic handler: the model is required (when configured).
            if llm_call is None:
                continue
            steps: list[tuple[Any, LlmCall, str | None]] = [
                (getattr(llm_call, "tier", "small"), llm_call, model)
            ]
            if escalate_call is not None:
                steps.append((getattr(escalate_call, "tier", "primary"), escalate_call, escalate_model))
            result, route = _llm_expansion(ans, q, steps)
            if routes is not None:
                routes.record(route)
            if result is None:
                continue
            draft, served = result
            appendix = draft.appendix.strip()
            out.append(
                EnrichmentProposalRecord(
                    id=proposal_id("answer", ans.id, "expanded_explanation", EXPANSION_LLM_PROMPT_VERSION),
                    target_kind="answer",
                    target_id=ans.id,
                    field="expanded_explanation",
                    proposal_json={
                        "value": f"{ans.expanded_explanation.strip()}\n\n{appendix}",
                        "appendix": appendix,
                        "appendix_provenance": "synthesised_unvalidated",
                        "enrichment_provenance": "gemini_synthesised",
                        "topic_handler": topic_key,
                        "canonical_question_id": ans.canonical_question_id,
                    },
                    current_json={"value": ans.expanded_explanation},
                    model=served,
                    prompt_version=EXPANSION_LLM_PROMPT_VERSION,
                    confidence=round(float(draft.confidence), 4),
                    status="pending",
                    auto_approved=False,
                    review_note="LLM appendix for a short source answer — editor approval required",
                )
            )
            continue
        synth = generate_answer(q)
        appendix = synth.expanded_explanation.strip()
        if not appendix or appendix in ans.expanded_explanation:
            continue
        if routes is not None:
            routes.record("heuristic")
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
