"""OpenRouter client (ADR 0007): request shape, validation, retries, tiers, routing."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

import httpx
import pytest

from ibpe_corpus.answers.depth import ExpansionDraft, propose_expansions
from ibpe_corpus.answers.enrich_job import run_enrich_batch, write_enrichment_report
from ibpe_corpus.answers.enrich_models import EnrichDraft
from ibpe_corpus.answers.llm_client import (
    EnrichClient,
    LlmAuthError,
    LlmConfigError,
    LlmHTTPError,
    LlmRateLimitError,
    LlmRouteCounts,
    LlmValidationError,
    OpenRouterClient,
    Tier,
    credentials_configured,
    resolve_model_id,
    strict_json_schema,
)
from ibpe_corpus.answers.provenance import EnrichmentProvenance
from ibpe_corpus.answers.taxonomy_enrich import SourceHints, propose_taxonomy
from ibpe_corpus.answers.validate import validate_answer
from ibpe_corpus.canonical.firm_signals import SignalTopicBatch, llm_topic_tagger
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    CanonicalQuestion,
    CorpusProvenance,
    Domain,
)

KEY = "sk-or-v1-test-secret-key"
SMALL = "deepseek/deepseek-v4-flash"
PRIMARY = "jev/jev-test"
FALLBACK = "z-ai/glm-4.5-air"


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "OPENROUTER_API_KEY",
        "OPENROUTER_BASE_URL",
        "OPENROUTER_REFERER",
        "LLM_SMALL_MODEL",
        "LLM_PRIMARY_MODEL",
        "LLM_FALLBACK_MODEL",
        "LLM_DEFAULT_TIER",
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


def _client(rec: Recorder, cls: type = EnrichClient, **kw: Any) -> Any:
    sleeps: list[float] = []
    client = cls(
        api_key=KEY,
        small_model=SMALL,
        primary_model=PRIMARY,
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
    assert EnrichClient().dry_run is True
    monkeypatch.setenv("OPENROUTER_API_KEY", KEY)
    assert credentials_configured() is True
    assert EnrichClient().dry_run is False


def test_tier_models_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    assert resolve_model_id() == SMALL  # default small = deepseek-v4-flash
    assert resolve_model_id(Tier.PRIMARY) == "deepseek/deepseek-v4.1-flash"
    monkeypatch.setenv("LLM_SMALL_MODEL", "z-ai/glm-4.5-air")
    monkeypatch.setenv("LLM_PRIMARY_MODEL", "jev/jev-1")
    monkeypatch.setenv("LLM_FALLBACK_MODEL", "")
    c = OpenRouterClient(api_key=KEY)
    assert c.model == "z-ai/glm-4.5-air" and c.model_for("primary") == "jev/jev-1"
    assert c.models_for(Tier.SMALL) == ["z-ai/glm-4.5-air"]  # empty fallback disables it
    assert c.tier_plan() == [Tier.SMALL, Tier.PRIMARY]
    assert OpenRouterClient(api_key=KEY, default_tier="primary").tier_plan() == [Tier.PRIMARY]
    assert OpenRouterClient(api_key=KEY, escalate=False).tier_plan() == [Tier.SMALL]


def test_dry_run_never_calls_network() -> None:
    rec = Recorder([])
    client = EnrichClient(api_key="", transport=httpx.MockTransport(rec))
    assert client.dry_run
    prop = client.propose(_q())
    assert prop.metadata["dry_run"] is True and prop.confidence == 0.35
    with pytest.raises(LlmConfigError):
        client.complete("hi", SignalTopicBatch)
    assert rec.requests == []


# --------------------------------------------------------------------------- #
# Request shape + validation                                                   #
# --------------------------------------------------------------------------- #


def test_request_shape_and_validated_proposal() -> None:
    rec = Recorder([httpx.Response(200, json=_completion(_draft(), model=FALLBACK))])
    client = _client(rec)
    prop = client.propose(_q(domain=Domain.IB))

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
    assert "allowed_topics" in body["messages"][1]["content"]

    # The served model (fallback here) is what gets recorded.
    assert prop.model_version == FALLBACK
    assert prop.topic == "valuation" and prop.confidence == pytest.approx(0.92)
    assert prop.provenance is EnrichmentProvenance.LLM_SYNTHESISED
    assert prop.metadata["tier"] == "small" and prop.metadata["dry_run"] is False
    assert client.usage["cost"] == pytest.approx(0.00004)
    assert client.usage["by_model"] == {FALLBACK: 1}


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


# --------------------------------------------------------------------------- #
# Tiers: small → primary escalation                                            #
# --------------------------------------------------------------------------- #


def test_escalates_to_primary_only_on_validation_failure() -> None:
    rec = Recorder(
        [
            httpx.Response(200, json=_completion(_draft(topic="not-a-topic"), model=SMALL)),
            httpx.Response(200, json=_completion(_draft(), model=PRIMARY)),
        ]
    )
    client = _client(rec)
    prop, route = client.propose_routed(_q())
    assert route == "primary" and prop is not None and prop.model_version == PRIMARY
    bodies = rec.bodies()
    assert [b["models"] for b in bodies] == [[SMALL, FALLBACK], [PRIMARY, FALLBACK]]
    assert prop.metadata["tier"] == "primary"


def test_small_success_never_touches_primary() -> None:
    rec = Recorder([httpx.Response(200, json=_completion(_draft()))])
    prop, route = _client(rec).propose_routed(_q())
    assert route == "small" and prop is not None and len(rec.requests) == 1


def test_http_failure_does_not_escalate() -> None:
    rec = Recorder([httpx.Response(500, json={})] * 2)
    client = _client(rec, max_retries=1)
    prop, route = client.propose_routed(_q())
    assert prop is None and route == "failed"
    assert all(b["model"] == SMALL for b in rec.bodies())


def test_primary_tier_flag_uses_jev_directly() -> None:
    rec = Recorder([httpx.Response(200, json=_completion(_draft(), model=PRIMARY))])
    client = _client(rec, default_tier="primary")
    prop, route = client.propose_routed(_q())
    assert route == "primary" and rec.bodies()[0]["models"][0] == PRIMARY


# --------------------------------------------------------------------------- #
# "Only when required"                                                         #
# --------------------------------------------------------------------------- #


def test_taxonomy_skips_llm_when_heuristic_auto_approves() -> None:
    rec = Recorder([])  # any request fails the test
    client = _client(rec)
    q = _q(qid="cq_a")
    hints = {"cq_a": SourceHints(category="dcf", track="M&A / Coverage", difficulty="Core",
                                 answer_text="Project FCF, discount at WACC, add terminal value")}
    routes = LlmRouteCounts()
    props = propose_taxonomy([q], hints, client=client, routes=routes)
    assert rec.requests == []
    assert routes.as_dict() == {"heuristic": 1, "small": 0, "primary": 0, "failed": 0}
    assert {p.field: p.status for p in props}["topic"] == "approved"


def test_taxonomy_calls_small_model_for_the_remainder() -> None:
    rec = Recorder([httpx.Response(200, json=_completion(_draft()))])
    client = _client(rec)
    routes = LlmRouteCounts()
    props = propose_taxonomy([_q(qid="cq_b")], {}, client=client, routes=routes)
    assert len(rec.requests) == 1 and routes.small == 1
    topic = next(p for p in props if p.field == "topic")
    assert topic.model == SMALL and topic.prompt_version == "enrich-v1"
    assert topic.status == "approved"  # agrees with keyword rules at ≥ 0.8


def test_enrich_batch_reports_route_counts(tmp_path: Path) -> None:
    rec = Recorder(
        [
            httpx.Response(200, json=_completion(_draft())),  # q1 small ok
            httpx.Response(200, json=_completion(_draft(topic="??"))),  # q2 small invalid
            httpx.Response(200, json=_completion(_draft(), model=PRIMARY)),  # q2 primary ok
            # q3: topic missing fails validation on both tiers → heuristic fallback
            httpx.Response(200, json=_completion(_draft(topic=None))),
            httpx.Response(200, json=_completion(_draft(topic=None), model=PRIMARY)),
        ]
    )
    client = _client(rec)
    qs = [_q(qid="q1"), _q("What is WACC?", qid="q2"), _q("Paper LBO?", qid="q3")]
    graph, _queue, metrics = run_enrich_batch(qs, client=client)
    assert (metrics["llm_heuristic"], metrics["llm_small"], metrics["llm_primary"],
            metrics["llm_failed"]) == (0, 1, 1, 1)
    assert metrics["llm_routes"] == {"heuristic": 0, "small": 1, "primary": 1, "failed": 1}
    assert metrics["models_used"] == sorted({SMALL, PRIMARY})
    failed = next(p for p in graph.proposals if p.canonical_question_id == "q3")
    assert failed.metadata.get("llm_failed") is True and failed.metadata["dry_run"] is True
    out = write_enrichment_report(graph, metrics, path=tmp_path / "r.json")
    report = json.loads(out.read_text())
    assert report["job"] == "llm_enrich"
    assert report["metrics"]["llm_routes"]["primary"] == 1


def test_enrich_batch_dry_run_is_all_heuristic() -> None:
    rec = Recorder([])
    client = EnrichClient(api_key="", transport=httpx.MockTransport(rec))
    _graph, _queue, metrics = run_enrich_batch([_q()], client=client)
    assert metrics["llm_routes"] == {"heuristic": 1, "small": 0, "primary": 0, "failed": 0}
    assert rec.requests == []


def test_json_caller_feeds_signal_tagger_with_served_model() -> None:
    rec = Recorder([httpx.Response(200, json=_completion({"topics": ["lbo", "nope"]}, model=FALLBACK))])
    client = _client(rec, cls=OpenRouterClient)
    caller = client.json_caller(SignalTopicBatch)
    tags = llm_topic_tagger(caller)(["paper lbo", "weather"])
    assert tags == ["lbo", None]
    assert caller.last_model == FALLBACK and caller.model == SMALL and caller.tier is Tier.SMALL
    assert rec.bodies()[0]["response_format"]["json_schema"]["name"] == "SignalTopicBatch"


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


def test_expansions_use_llm_only_without_a_topic_handler() -> None:
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
    client = _client(rec, cls=OpenRouterClient)
    routes = LlmRouteCounts()
    props = propose_expansions(
        [a_known, a_generic],
        [known, generic],
        llm_call=client.json_caller(ExpansionDraft),
        escalate_call=client.json_caller(ExpansionDraft, tier="primary"),
        routes=routes,
    )
    by_target = {p.target_id: p for p in props}
    assert by_target[a_known.id].prompt_version == "expand-heuristic-v1"
    llm = by_target[a_generic.id]
    assert llm.prompt_version == "expand-v1" and llm.model == SMALL and llm.status == "pending"
    assert llm.proposal_json["appendix"] == appendix
    assert routes.as_dict() == {"heuristic": 1, "small": 1, "primary": 0, "failed": 0}
    assert len(rec.requests) == 1


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
