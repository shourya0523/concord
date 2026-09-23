"""OpenRouter small-model chat client (ADR 0007): request shape, validation, retries.

Jev (Decisions API) behaviour lives in ``test_decisions_client.py``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

import httpx
import pytest

from ibpe_corpus.answers.depth import ExpansionDraft, propose_expansions
from ibpe_corpus.answers.enrich_models import EnrichDraft
from ibpe_corpus.answers.decisions_client import DecisionConfigError, DecisionsClient
from ibpe_corpus.answers.llm_client import (
    LlmAuthError,
    LlmConfigError,
    LlmHTTPError,
    LlmRateLimitError,
    LlmRouteCounts,
    LlmValidationError,
    OpenRouterClient,
    Tier,
    credentials_configured,
    heuristic_proposal,
    resolve_model_id,
    strict_json_schema,
)
from ibpe_corpus.answers.provenance import EnrichmentProvenance
from ibpe_corpus.answers.validate import validate_answer
from ibpe_corpus.canonical.firm_signals import SignalTopicBatch, llm_topic_tagger
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    CanonicalQuestion,
    CorpusProvenance,
)

KEY = "sk-or-v1-test-secret-key"
SMALL = "deepseek/deepseek-v4-flash"
FALLBACK = "z-ai/glm-4.5-air"
JEV = "typesafe/jev-1.13"


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "OPENROUTER_API_KEY",
        "OPENROUTER_BASE_URL",
        "OPENROUTER_REFERER",
        "OPENROUTER_DECISIONS_URL",
        "LLM_SMALL_MODEL",
        "LLM_DECISION_MODEL",
        "LLM_FALLBACK_MODEL",
        "JEV_AUTO_APPROVE",
        "JEV_ACCEPT_CONFIDENCE",
    ):
        monkeypatch.delenv(name, raising=False)


def _draft(**over: Any) -> dict[str, Any]:
    body = {
        "track": "IB",
        "topic": "valuation",
        "subtopic": "dcf",
        "concepts": [{"slug": "dcf", "title": "DCF", "prerequisites": ["wacc"]}],
        "difficulty": "medium",
        "interview_stage_hints": ["technical"],
        "firm_soft_tags": [],
        "mode_routing": {"modes": ["both"], "company_prep_weight": 0.5, "concept_learn_weight": 0.7},
        "pe_relevance": None,
        "ib_relevance": "core",
        "interview_ready_rewrite": None,
        "diagram_drafts": [
            {"type": "dcf", "format": "mermaid", "spec": "flowchart LR\n A-->B", "a11y_fallback": None}
        ],
        "resource_drafts": [],
        "confidence": 0.92,
    }
    body.update(over)
    return body


def _completion(content: Any, *, model: str = SMALL) -> dict[str, Any]:
    text = content if isinstance(content, str) else json.dumps(content)
    return {
        "id": "gen-1",
        "model": model,
        "choices": [{"message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 120, "completion_tokens": 80, "cost": 0.00004},
    }


class Recorder:
    """httpx MockTransport handler that replays queued responses and records requests."""

    def __init__(self, responses: list[httpx.Response | Callable[[httpx.Request], httpx.Response]]):
        self.responses = list(responses)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if not self.responses:
            raise AssertionError("unexpected OpenRouter request")
        nxt = self.responses.pop(0)
        return nxt(request) if callable(nxt) else nxt

    def bodies(self) -> list[dict[str, Any]]:
        return [json.loads(r.content) for r in self.requests]


def _client(rec: Recorder, cls: type = OpenRouterClient, **kw: Any) -> Any:
    sleeps: list[float] = []
    client = cls(
        api_key=KEY,
        small_model=SMALL,
        fallback_model=FALLBACK,
        transport=httpx.MockTransport(rec),
        sleep=sleeps.append,
        backoff_base=0.5,
        **kw,
    )
    client.sleeps = sleeps
    return client


def _q(wording: str = "Walk me through a DCF", qid: str = "cq_dcf", **kw: Any) -> CanonicalQuestion:
    return CanonicalQuestion(id=qid, canonical_wording=wording, **kw)


# --------------------------------------------------------------------------- #
# Config / credentials                                                         #
# --------------------------------------------------------------------------- #


def test_credentials_key_off_openrouter(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "legacy")
    monkeypatch.setenv("AI_GATEWAY_API_KEY", "legacy")
    assert credentials_configured() is False
    assert OpenRouterClient().dry_run is True and DecisionsClient().dry_run is True
    monkeypatch.setenv("OPENROUTER_API_KEY", KEY)
    assert credentials_configured() is True
    assert OpenRouterClient().dry_run is False and DecisionsClient().dry_run is False


def test_small_model_is_the_only_chat_tier(monkeypatch: pytest.MonkeyPatch) -> None:
    assert resolve_model_id() == SMALL  # default small = deepseek-v4-flash
    assert [t.value for t in Tier] == ["small"]
    with pytest.raises(ValueError):
        resolve_model_id("primary")  # placeholder primary chat tier is gone
    monkeypatch.setenv("LLM_SMALL_MODEL", "z-ai/glm-4.5-air")
    monkeypatch.setenv("LLM_PRIMARY_MODEL", "jev/jev-1")  # ignored now
    monkeypatch.setenv("LLM_FALLBACK_MODEL", "")
    c = OpenRouterClient(api_key=KEY)
    assert c.model == "z-ai/glm-4.5-air"
    assert c.models_for() == ["z-ai/glm-4.5-air"]  # empty fallback disables it
    assert c.draft_attempts == 2  # --escalate: retry once with the small model
    assert OpenRouterClient(api_key=KEY, escalate=False).draft_attempts == 1
    assert c.json_caller(SignalTopicBatch).attempts == 2


def test_dry_run_never_calls_network() -> None:
    rec = Recorder([])
    client = OpenRouterClient(api_key="", transport=httpx.MockTransport(rec))
    decider = DecisionsClient(api_key="", transport=httpx.MockTransport(rec))
    assert client.dry_run and decider.dry_run
    prop = heuristic_proposal(_q())
    assert prop.metadata["dry_run"] is True and prop.confidence == 0.35
    with pytest.raises(LlmConfigError):
        client.complete("hi", SignalTopicBatch)
    with pytest.raises(DecisionConfigError):
        decider.decide({"x": 1}, {"q": {"type": "noul", "instructions": "?"}})
    assert rec.requests == []


# --------------------------------------------------------------------------- #
# Request shape + validation                                                   #
# --------------------------------------------------------------------------- #


def test_request_shape_and_validated_reply() -> None:
    rec = Recorder([httpx.Response(200, json=_completion(_draft(), model=FALLBACK))])
    client = _client(rec)
    result = client.complete("INPUT: {}", EnrichDraft, system="sys")

    (req,) = rec.requests
    assert str(req.url) == "https://openrouter.ai/api/v1/chat/completions"
    assert req.method == "POST"
    assert req.headers["authorization"] == f"Bearer {KEY}"
    assert req.headers["x-title"] == "Concord"
    body = json.loads(req.content)
    assert body["model"] == SMALL
    assert body["models"] == [SMALL, FALLBACK]
    assert body["usage"] == {"include": True}
    rf = body["response_format"]
    assert rf["type"] == "json_schema"
    assert rf["json_schema"]["name"] == "EnrichDraft"
    assert rf["json_schema"]["strict"] is True
    assert rf["json_schema"]["schema"] == strict_json_schema(EnrichDraft)
    assert [m["role"] for m in body["messages"]] == ["system", "user"]

    # The served model (fallback here) is what gets recorded.
    assert result.model == FALLBACK and result.requested_model == SMALL
    assert result.tier is Tier.SMALL
    assert result.value.topic == "valuation" and result.value.confidence == pytest.approx(0.92)
    assert client.usage["cost"] == pytest.approx(0.00004)
    assert client.usage["by_model"] == {FALLBACK: 1}
    assert heuristic_proposal(_q()).provenance is EnrichmentProvenance.LLM_SYNTHESISED


def test_base_url_and_referer_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_BASE_URL", "https://proxy.example/api/v1/")
    monkeypatch.setenv("OPENROUTER_REFERER", "https://concord.example")
    rec = Recorder([httpx.Response(200, json=_completion({"topics": ["lbo"]}))])
    client = _client(rec, cls=OpenRouterClient)
    result = client.complete("tag", SignalTopicBatch)
    assert str(rec.requests[0].url) == "https://proxy.example/api/v1/chat/completions"
    assert rec.requests[0].headers["http-referer"] == "https://concord.example"
    assert result.value.topics == ["lbo"] and result.model == SMALL


def test_strict_schema_closes_every_object() -> None:
    schema = strict_json_schema(EnrichDraft)

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            assert "default" not in node and "minimum" not in node and "maxItems" not in node
            if "$ref" in node:
                assert list(node) == ["$ref"]
            if node.get("type") == "object":
                assert node["additionalProperties"] is False
                assert node["required"] == list(node["properties"])
            for k, v in node.items():
                if k in {"properties", "$defs"}:
                    for sub in v.values():
                        walk(sub)
                else:
                    walk(v)
        elif isinstance(node, list):
            for n in node:
                walk(n)

    walk(schema)
    # A property literally named "type" (DiagramDraftOut.type) survives intact.
    diag = schema["$defs"]["DiagramDraftOut"]
    assert "type" in diag["properties"] and diag["required"][0] == "type"


def test_invalid_json_and_schema_raise_validation_error() -> None:
    rec = Recorder(
        [
            httpx.Response(200, json=_completion("not json {")),
            httpx.Response(200, json=_completion({"topics": "lbo"})),
            httpx.Response(200, json=_completion("```json\n{\"topics\": [\"lbo\"]}\n```")),
        ]
    )
    client = _client(rec, cls=OpenRouterClient)
    with pytest.raises(LlmValidationError):
        client.complete("x", SignalTopicBatch)
    with pytest.raises(LlmValidationError) as exc:
        client.complete("x", SignalTopicBatch)
    assert exc.value.errors and exc.value.model == SMALL
    assert client.complete("x", SignalTopicBatch).value.topics == ["lbo"]  # fenced JSON tolerated


# --------------------------------------------------------------------------- #
# Retries + typed errors                                                       #
# --------------------------------------------------------------------------- #


def test_retry_on_429_then_success() -> None:
    rec = Recorder(
        [
            httpx.Response(429, headers={"retry-after": "2"}, json={"error": {"message": "slow down"}}),
            httpx.Response(503, json={"error": {"message": "upstream"}}),
            httpx.Response(200, json=_completion({"topics": ["returns"]})),
        ]
    )
    client = _client(rec, cls=OpenRouterClient)
    result = client.complete("x", SignalTopicBatch)
    assert result.value.topics == ["returns"]
    assert len(rec.requests) == 3
    assert client.sleeps == [2.0, 1.0]  # Retry-After honoured, then 0.5 * 2**1
    assert client.usage["retries"] == 2


def test_retry_on_error_inside_200_envelope() -> None:
    rec = Recorder(
        [
            httpx.Response(200, json={"error": {"code": 429, "message": "provider rate limited"}}),
            httpx.Response(200, json=_completion({"topics": ["credit"]})),
        ]
    )
    client = _client(rec, cls=OpenRouterClient)
    assert client.complete("x", SignalTopicBatch).value.topics == ["credit"]
    assert len(rec.requests) == 2


def test_rate_limit_exhausted_is_typed_and_never_leaks_key() -> None:
    rec = Recorder([httpx.Response(429, json={"error": {"message": f"bad {KEY}"}})] * 3)
    client = _client(rec, cls=OpenRouterClient, max_retries=2)
    with pytest.raises(LlmRateLimitError) as exc:
        client.complete("x", SignalTopicBatch)
    assert exc.value.status == 429 and len(rec.requests) == 3
    assert KEY not in str(exc.value)
    assert KEY not in repr(client)


def test_client_errors_do_not_retry() -> None:
    rec = Recorder(
        [
            httpx.Response(401, json={"error": {"message": "No auth credentials found"}}),
            httpx.Response(400, json={"error": {"message": "bad schema"}}),
        ]
    )
    client = _client(rec, cls=OpenRouterClient)
    with pytest.raises(LlmAuthError):
        client.complete("x", SignalTopicBatch)
    with pytest.raises(LlmHTTPError) as exc:
        client.complete("x", SignalTopicBatch)
    assert exc.value.status == 400 and len(rec.requests) == 2 and client.sleeps == []


def test_transport_error_retries_then_raises() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    rec = Recorder([boom, boom])
    client = _client(rec, cls=OpenRouterClient, max_retries=1)
    with pytest.raises(Exception) as exc:
        client.complete("x", SignalTopicBatch)
    assert type(exc.value).__name__ == "LlmTransportError" and len(rec.requests) == 2


def test_json_caller_feeds_signal_tagger_with_served_model() -> None:
    rec = Recorder([httpx.Response(200, json=_completion({"topics": ["lbo", "nope"]}, model=FALLBACK))])
    client = _client(rec)
    caller = client.json_caller(SignalTopicBatch)
    tags = llm_topic_tagger(caller)(["paper lbo", "weather"])
    assert tags == ["lbo", None]
    assert caller.last_model == FALLBACK and caller.model == SMALL and caller.tier is Tier.SMALL
    assert rec.bodies()[0]["response_format"]["json_schema"]["name"] == "SignalTopicBatch"


def test_route_counts_shape() -> None:
    routes = LlmRouteCounts()
    for r in ("heuristic", "jev", "jev", "small", "failed"):
        routes.record(r)
    assert routes.as_dict() == {"heuristic": 1, "jev": 2, "small": 1, "failed": 1}
    with pytest.raises(ValueError):
        routes.record("primary")
    merged = routes.merge(LlmRouteCounts(jev=1, jev_rejected=3))
    assert merged.jev == 3 and merged.jev_rejected == 3 and merged.llm_calls_attempted == 5


def _shallow(qid: str, text: str) -> Answer:
    return validate_answer(
        Answer(
            canonical_question_id=qid,
            concise_answer=text,
            expanded_explanation=text,
            provenance_type=AnswerProvenance.SOURCE_PROVIDED,
            source_ids=["raw_1"],
        )
    )


def _decisions(answers: dict[str, Any], *, model: str = JEV + "-20260917") -> dict[str, Any]:
    return {
        "id": "gen-dec-1",
        "model": model,
        "provider": "TypeSafe",
        "answers": answers,
        "usage": {"input_tokens": 400, "output_tokens": 60, "cost": 0.0000168},
    }


def test_expansions_use_small_model_only_without_a_topic_handler_and_jev_verify() -> None:
    known = _q("What is WACC?", qid="cq_w")
    generic = _q("What is a SPAC?", qid="cq_g")
    a_known = _shallow(known.id, "WACC is the blended cost of capital for the firm.")
    a_generic = _shallow(generic.id, "A listed shell company that raises cash to buy a private firm.")
    assert "needs_expansion" in a_known.quality_tags and "needs_expansion" in a_generic.quality_tags
    appendix = (
        "Sponsors raise money in an IPO into a trust, then have a fixed window to find and merge "
        "with a private target, which becomes public without a traditional IPO process."
    )
    rec = Recorder([httpx.Response(200, json=_completion({"appendix": appendix, "confidence": 0.7}))])
    client = _client(rec)
    jev_rec = Recorder([
        httpx.Response(200, json=_decisions({
            "support": {"type": "choice", "choice": "supported", "confidence": 0.93,
                        "probabilities": {"supported": 0.95, "unsupported": 0.05, "declined": 0}},
        })),
    ])
    decider = DecisionsClient(api_key=KEY, transport=httpx.MockTransport(jev_rec), sleep=lambda s: None)
    routes = LlmRouteCounts()
    props = propose_expansions(
        [a_known, a_generic],
        [known, generic],
        llm_call=client.json_caller(ExpansionDraft),
        verifier=decider,
        routes=routes,
    )
    by_target = {p.target_id: p for p in props}
    assert by_target[a_known.id].prompt_version == "expand-heuristic-v1"
    llm = by_target[a_generic.id]
    assert llm.prompt_version == "expand-v1" and llm.model == SMALL and llm.status == "pending"
    assert llm.proposal_json["appendix"] == appendix
    assert llm.proposal_json["jev_verdict"]["choice"] == "supported"
    assert routes.as_dict() == {"heuristic": 1, "jev": 0, "small": 1, "failed": 0}
    assert len(rec.requests) == 1 and len(jev_rec.requests) == 1
    body = jev_rec.bodies()[0]
    assert body["state"]["draft"] == appendix
    assert body["state"]["source_teaching_answer"] == a_generic.expanded_explanation
    assert set(body["questions"]["support"]["criteria"]) == {"supported", "unsupported", "declined"}


def test_expansion_rejected_by_jev_leaves_no_proposal() -> None:
    generic = _q("What is a SPAC?", qid="cq_g")
    a_generic = _shallow(generic.id, "A listed shell company that raises cash to buy a private firm.")
    appendix = "SPACs always return 25% to investors within two years and are regulated by Glass-Steagall."
    rec = Recorder([httpx.Response(200, json=_completion({"appendix": appendix, "confidence": 0.9}))])
    jev_rec = Recorder([
        httpx.Response(200, json=_decisions({
            "support": {"type": "choice", "choice": "unsupported", "confidence": 0.99},
        })),
    ])
    decider = DecisionsClient(api_key=KEY, transport=httpx.MockTransport(jev_rec), sleep=lambda s: None)
    routes = LlmRouteCounts()
    props = propose_expansions(
        [a_generic], [generic],
        llm_call=_client(rec, escalate=False).json_caller(ExpansionDraft),
        verifier=decider, routes=routes,
    )
    assert props == [] and routes.failed == 1 and routes.jev_rejected == 1
    assert len(rec.requests) == 1  # --no-escalate: no second small-model attempt


# --------------------------------------------------------------------------- #
# Provenance contract                                                          #
# --------------------------------------------------------------------------- #


def test_provenance_value_is_frozen_by_ts_contract() -> None:
    enums_ts = (
        Path(__file__).resolve().parents[2] / "packages" / "contracts" / "src" / "enums.ts"
    ).read_text(encoding="utf-8")
    assert '"gemini_synthesised"' in enums_ts  # shared with TypeScript → stored value kept
    assert EnrichmentProvenance.LLM_SYNTHESISED is EnrichmentProvenance.GEMINI_SYNTHESISED
    assert EnrichmentProvenance.LLM_SYNTHESISED.value == "gemini_synthesised"
    # Backward/forward-compatible reader.
    assert EnrichmentProvenance("llm_synthesised") is EnrichmentProvenance.LLM_SYNTHESISED
    assert CorpusProvenance("llm_synthesised") is CorpusProvenance.GEMINI_SYNTHESISED
    assert [p.value for p in CorpusProvenance].count("gemini_synthesised") == 1
