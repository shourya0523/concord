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
:func:`validate_expansion` and then Jev verification against the source answer
(``supported`` at ≥ ``JEV_ACCEPT_CONFIDENCE``); with ``--escalate`` a rejected
draft is retried once with the small model. Anything else leaves the answer
without a proposal. Accepted drafts are still ``pending`` proposals — never
auto-applied.
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


RETRY_NOTE = (
    "\nThe previous draft was rejected (validation or verification). Stay strictly consistent with the "
    "SOURCE ANSWER and add no new facts or numbers."
)

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
    call: LlmCall,
    model: str | None,
    verifier: Any,
    attempts: int,
    routes: Any | None,
) -> tuple[tuple[ExpansionDraft, str | None, Any] | None, str]:
    """Small draft → validators → Jev verification; ``((draft, model, verdict) | None, route)``."""
    from ibpe_corpus.answers.jev_questions import EXPANSION_VERIFY
    from ibpe_corpus.answers.llm_client import LlmValidationError, run_verified

    prompt = EXPAND_PROMPT.format(question=q.canonical_wording, answer=ans.expanded_explanation)
    tries = {"n": 0}

    def draft() -> tuple[ExpansionDraft, str | None]:
        text = prompt + (RETRY_NOTE if tries["n"] else "")
        tries["n"] += 1
        try:
            d = ExpansionDraft.model_validate(call(text))
        except ValueError as exc:  # pydantic ValidationError is a ValueError
            raise LlmValidationError("expand-v1 reply unusable", errors=[str(exc)[:120]]) from None
        errors = validate_expansion(d.appendix, ans)
        if errors:
            raise LlmValidationError("expand-v1 draft failed validation", errors=errors)
        served = getattr(call, "last_model", None) or model or getattr(call, "model", None)
        return d, served

    def verify(value: tuple[ExpansionDraft, str | None]) -> Any:
        return verifier.verify(
            source=ans.expanded_explanation,
            question=q.canonical_wording,
            draft=value[0].appendix,
            instructions=EXPANSION_VERIFY["instructions"],
            criteria=EXPANSION_VERIFY["criteria"],
        )

    value, route, verdicts = run_verified(draft, verify, attempts=attempts, counts=routes)
    if value is None:
        return None, route
    return (value[0], value[1], verdicts[-1]), route


def propose_expansions(
    answers: Sequence[Answer],
    questions: Sequence[CanonicalQuestion],
    *,
    llm_call: LlmCall | None = None,
    model: str | None = None,
    verifier: Any | None = None,
    attempts: int | None = None,
    routes: Any | None = None,
) -> list[EnrichmentProposalRecord]:
    """Expansion proposals for shallow source answers.

    Known topics get the deterministic handler's appendix; ``generic`` topics
    get a small-model draft only when both ``llm_call`` and a Jev ``verifier``
    are configured (unverified drafts are never proposed).
    """
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
            if llm_call is None or verifier is None or getattr(verifier, "dry_run", False):
                continue
            n = attempts if attempts is not None else int(getattr(llm_call, "attempts", 1) or 1)
            result, route = _llm_expansion(ans, q, llm_call, model, verifier, n, routes)
            if routes is not None:
                routes.record(route)
            if result is None:
                continue
            draft, served, verdict = result
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
                        "jev_verdict": verdict.as_dict(),
                    },
                    current_json={"value": ans.expanded_explanation},
                    model=served,
                    prompt_version=EXPANSION_LLM_PROMPT_VERSION,
                    confidence=round(float(draft.confidence), 4),
                    status="pending",
                    auto_approved=False,
                    review_note="Jev-verified LLM appendix for a short source answer — editor approval required",
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
