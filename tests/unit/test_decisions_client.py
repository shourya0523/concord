"""Jev on OpenRouter (ADR 0007): Decisions API client, taxonomy / graph / tagger routing,
and the Jev verification gate on small-model drafts. All HTTP is mocked."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

import httpx
import pytest

from ibpe_corpus.answers.decisions_client import (
    DECISION_MODEL_DEFAULT,
    ChoiceAnswer,
    ChoiceQuestion,
    DecisionAuthError,
    DecisionHTTPError,
    DecisionRateLimitError,
    DecisionResponseError,
    DecisionsClient,
    NoulAnswer,
    ScoreAnswer,
    ScoreQuestion,
    Verdict,
    decide,
    decisions_url,
)
from ibpe_corpus.answers.enrich_job import run_enrich_batch, write_enrichment_report
from ibpe_corpus.answers.jev_questions import TOPIC_CRITERIA
from ibpe_corpus.answers.llm_client import LlmRouteCounts, LlmValidationError, run_verified
from ibpe_corpus.answers.taxonomy_enrich import (
    SourceHints,
    apply_approved,
    propose_taxonomy,
    run_taxonomy_enrichment,
)
from ibpe_corpus.canonical.firm_signals import jev_topic_tagger
from ibpe_corpus.canonical.taxonomy_rules import TOPIC_SLUGS
from ibpe_corpus.schemas.models import CanonicalQuestion, Domain

KEY = "sk-or-v1-test-secret-key"
JEV = "typesafe/jev-1.13"
SERVED = "typesafe/jev-1.13-20260917"
URL = "https://openrouter.ai/api/alpha/decisions"


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "OPENROUTER_API_KEY",
        "OPENROUTER_BASE_URL",
        "OPENROUTER_DECISIONS_URL",
        "OPENROUTER_REFERER",
        "LLM_DECISION_MODEL",
        "JEV_AUTO_APPROVE",
        "JEV_ACCEPT_CONFIDENCE",
    ):
        monkeypatch.delenv(name, raising=False)


class Recorder:
    def __init__(self, responses: list[httpx.Response | Callable[[httpx.Request], httpx.Response]]):
        self.responses = list(responses)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if not self.responses:
            raise AssertionError("unexpected Decisions request")
        nxt = self.responses.pop(0)
        return nxt(request) if callable(nxt) else nxt

    def bodies(self) -> list[dict[str, Any]]:
        return [json.loads(r.content) for r in self.requests]


def _resp(answers: dict[str, Any], *, cost: float | None = 0.0000168) -> dict[str, Any]:
    usage: dict[str, Any] = {"input_tokens": 400, "output_tokens": 60}
    if cost is not None:
        usage["cost"] = cost
    return {"id": "gen-dec-1", "model": SERVED, "provider": "TypeSafe", "answers": answers,
            "usage": usage}


def _choice(choice: str, conf: float | None, **probs: float) -> dict[str, Any]:
    out: dict[str, Any] = {"type": "choice", "choice": choice, "probabilities": probs}
    if conf is not None:
        out["confidence"] = conf
    return out


def _score(score: float, conf: float) -> dict[str, Any]:
    return {"type": "score", "score": score, "confidence": conf,
            "probabilities": {"0": 0, "1": 1, "2": 0}}


def _decider(rec: Recorder, **kw: Any) -> DecisionsClient:
    sleeps: list[float] = []
    client = DecisionsClient(api_key=KEY, transport=httpx.MockTransport(rec), sleep=sleeps.append,
                             backoff_base=0.5, **kw)
    client.sleeps = sleeps  # type: ignore[attr-defined]
    return client


def _q(wording: str, qid: str, **kw: Any) -> CanonicalQuestion:
    return CanonicalQuestion(id=qid, canonical_wording=wording, **kw)


# --------------------------------------------------------------------------- #
# Client: request shape, parsing, usage                                        #
# --------------------------------------------------------------------------- #


def test_request_shape_and_typed_answers() -> None:
    rec = Recorder([httpx.Response(200, json=_resp({
        "is_bug": {"type": "noul", "noul": 0.96},
        "team": _choice("payments", 0.67, payments=0.78, frontend=0.22, account=0),
        "urgency": {"type": "score", "score": 1.99, "confidence": 0.99,
                    "probabilities": {"0": 0, "1": 0, "2": 1},
                    "legend": {"0": "later", "1": "week", "2": "now"}},
    }))])
    client = _decider(rec)
    resp = client.decide(
        {"ticket": "Checkout shows a blank screen"},
        {
            "is_bug": {"type": "noul", "instructions": "Is it a defect?"},
            "team": ChoiceQuestion(instructions="Which team?",
                                   criteria={"payments": "p", "frontend": "f", "account": "a"}),
            "urgency": ScoreQuestion(instructions="How urgent?", criteria=["later", "week", "now"]),
        },
    )
    (req,) = rec.requests
    assert str(req.url) == URL and req.method == "POST"
    assert req.headers["authorization"] == f"Bearer {KEY}"
    assert req.headers["content-type"] == "application/json"
    body = json.loads(req.content)
    assert body["model"] == JEV == DECISION_MODEL_DEFAULT
    assert body["state"] == {"ticket": "Checkout shows a blank screen"}
    assert body["questions"]["team"] == {
        "type": "choice", "instructions": "Which team?",
        "criteria": {"payments": "p", "frontend": "f", "account": "a"},
    }
    assert body["questions"]["urgency"]["criteria"] == ["later", "week", "now"]
    assert isinstance(resp.answers["is_bug"], NoulAnswer) and resp.noul("is_bug").noul == 0.96
    team = resp.choice("team")
    assert isinstance(team, ChoiceAnswer) and team.choice == "payments" and team.conf == 0.67
    urgency = resp.score("urgency")
    assert isinstance(urgency, ScoreAnswer) and urgency.index(3) == 2
    # Cost / usage passthrough.
    assert resp.model == SERVED and resp.usage.cost == pytest.approx(0.0000168)
    assert client.usage["requests"] == 1 and client.usage["input_tokens"] == 400
    assert client.usage["cost"] == pytest.approx(0.0000168)
    assert client.usage["by_model"] == {SERVED: 1}


def test_url_and_model_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_BASE_URL", "https://proxy.example:8443/api/v1/")
    assert decisions_url() == "https://proxy.example:8443/api/alpha/decisions"
    monkeypatch.setenv("OPENROUTER_DECISIONS_URL", "https://edge.example/decide/")
    assert decisions_url() == "https://edge.example/decide"
    monkeypatch.setenv("LLM_DECISION_MODEL", "~typesafe/jev-latest")
    rec = Recorder([httpx.Response(200, json=_resp({"x": {"type": "noul", "noul": 0.1}}, cost=None))])
    client = _decider(rec)
    resp = client.decide({"a": 1}, {"x": {"type": "noul", "instructions": "?"}})
    assert str(rec.requests[0].url) == "https://edge.example/decide"
    assert rec.bodies()[0]["model"] == "~typesafe/jev-latest"
    assert resp.usage.cost is None and client.usage["cost"] == 0.0
    # Per-call model override (module-level helper uses its own client).
    rec2 = Recorder([httpx.Response(200, json=_resp({"x": {"type": "noul", "noul": 0.9}}))])
    decide({"a": 1}, {"x": {"type": "noul", "instructions": "?"}}, model=JEV, client=_decider(rec2))
    assert rec2.bodies()[0]["model"] == JEV


def test_response_validation_errors_are_typed() -> None:
    q = {"team": {"type": "choice", "instructions": "?", "criteria": {"a": "A", "b": "B"}}}
    rec = Recorder([
        httpx.Response(200, json=_resp({"team": _choice("zzz", 0.9)})),  # unknown label
        httpx.Response(200, json=_resp({})),  # missing answer
        httpx.Response(200, json=_resp({"team": {"type": "noul", "noul": 0.5}})),  # wrong type
        httpx.Response(200, json={"answers": {"team": {"type": "choice"}}}),  # schema
    ])
    client = _decider(rec)
    for _ in range(4):
        with pytest.raises(DecisionResponseError):
            client.decide({"s": 1}, q)
    assert client.sleeps == []  # response errors never retry


# --------------------------------------------------------------------------- #
# Retries + typed errors                                                       #
# --------------------------------------------------------------------------- #


def test_retry_on_429_529_and_in_flight_budget() -> None:
    ok = httpx.Response(200, json=_resp({"x": {"type": "noul", "noul": 0.2}}))
    rec = Recorder([
        httpx.Response(429, headers={"retry-after": "3"}, json={"error": {"message": "slow"}}),
        httpx.Response(529, json={"error": {"message": "overloaded"}}),
        httpx.Response(402, json={"error": {"message": "budget",
                                            "metadata": {"limit_source": "openrouter_in_flight_budget"}}}),
        ok,
    ])
    client = _decider(rec)
    resp = client.decide({"s": 1}, {"x": {"type": "noul", "instructions": "?"}})
    assert resp.noul("x").noul == 0.2 and len(rec.requests) == 4
    assert client.sleeps == [3.0, 1.0, 2.0]  # Retry-After, then 0.5 * 2**n
    assert client.usage["retries"] == 3


def test_errors_are_typed_and_never_leak_key() -> None:
    q = {"x": {"type": "noul", "instructions": "?"}}
    rec = Recorder([httpx.Response(429, json={"error": {"message": f"bad {KEY}"}})] * 3)
    client = _decider(rec, max_retries=2)
    with pytest.raises(DecisionRateLimitError) as exc:
        client.decide({"s": 1}, q)
    assert exc.value.status == 429 and KEY not in str(exc.value) and KEY not in repr(client)

    rec2 = Recorder([
        httpx.Response(401, json={"error": {"message": "No auth"}}),
        httpx.Response(402, json={"error": {"message": "Insufficient credits"}}),
        httpx.Response(400, json={"error": {"message": "bad question"}}),
    ])
    client2 = _decider(rec2)
    with pytest.raises(DecisionAuthError):
        client2.decide({"s": 1}, q)
    with pytest.raises(DecisionHTTPError) as exc402:
        client2.decide({"s": 1}, q)
    with pytest.raises(DecisionHTTPError) as exc400:
        client2.decide({"s": 1}, q)
    assert (exc402.value.status, exc400.value.status) == (402, 400)
    assert client2.sleeps == [] and len(rec2.requests) == 3

    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    client3 = _decider(Recorder([boom, boom]), max_retries=1)
    with pytest.raises(Exception) as exc3:
        client3.decide({"s": 1}, q)
    assert type(exc3.value).__name__ == "DecisionTransportError"


# --------------------------------------------------------------------------- #
# Taxonomy: heuristic first, ONE Jev request per question                      #
# --------------------------------------------------------------------------- #


def test_taxonomy_no_network_when_heuristic_suffices() -> None:
    rec = Recorder([])  # any request fails the test
    q = _q("Walk me through a DCF", "cq_a")
    hints = {"cq_a": SourceHints(category="dcf", track="M&A / Coverage", difficulty="Core",
                                 answer_text="Project FCF, discount at WACC, add terminal value")}
    routes = LlmRouteCounts()
    props = propose_taxonomy([q], hints, decider=_decider(rec), routes=routes)
    assert rec.requests == []
    assert routes.as_dict() == {"heuristic": 1, "jev": 0, "small": 0, "failed": 0}
    assert {p.field: p.status for p in props} == {
        "topic": "approved", "domain": "approved", "difficulty": "approved"}


def test_taxonomy_one_jev_request_with_thresholds() -> None:
    rec = Recorder([
        # q1: topic agrees with rules @0.85 → approved; domain 0.82 agrees (valuation → ib);
        #     difficulty score 1 (medium) agrees with the cue guess @0.85 → approved.
        httpx.Response(200, json=_resp({
            "topic": _choice("valuation", 0.85, valuation=0.9, lbo=0.1),
            "domain": _choice("ib", 0.82),
            "difficulty": _score(1.1, 0.85),
        })),
        # q2: topic disagrees with rules (credit) @0.85 → pending; domain "other" → pending;
        #     difficulty "hard" agrees with the cue guess but only @0.7 → pending. The
        #     heuristic guesses PE (credit → pe), so pe_strategy rides along ("general").
        httpx.Response(200, json=_resp({
            "topic": _choice("lbo", 0.85),
            "domain": _choice("other", 0.99),
            "difficulty": _score(2.0, 0.7),
            "pe_strategy": _choice("general", 0.6),
        })),
    ])
    client = _decider(rec)
    routes = LlmRouteCounts()
    q1 = _q("How do you calculate WACC and use it to discount cash flows?", "cq_1")
    q2 = _q("Why would a company issue a convertible bond?", "cq_2")
    props = propose_taxonomy([q1, q2], {}, decider=client, routes=routes)
    assert len(rec.requests) == 2 and routes.as_dict() == {"heuristic": 0, "jev": 2, "small": 0, "failed": 0}
    body = rec.bodies()[0]
    assert set(body["questions"]) == {"topic", "domain", "difficulty"}
    assert tuple(body["questions"]["topic"]["criteria"]) == TOPIC_SLUGS
    assert body["questions"]["topic"]["criteria"] == TOPIC_CRITERIA
    assert set(body["questions"]["domain"]["criteria"]) == {"ib", "pe", "both", "other"}
    assert body["questions"]["difficulty"]["type"] == "score"
    assert len(body["questions"]["difficulty"]["criteria"]) == 3
    assert body["state"]["interview_question"] == q1.canonical_wording

    by = {(p.target_id, p.field): p for p in props}
    t1 = by[("cq_1", "topic")]
    assert t1.status == "approved" and t1.model == SERVED and t1.prompt_version == "taxonomy-jev-v1"
    assert t1.proposal_json["signals"]["jev"]["topic"]["choice"] == "valuation"
    assert by[("cq_1", "domain")].status == "approved"
    assert by[("cq_1", "difficulty")].proposal_json["value"] == "medium"
    assert by[("cq_1", "difficulty")].status == "approved"
    assert by[("cq_2", "topic")].status == "pending"
    assert by[("cq_2", "domain")].status == "pending"
    assert by[("cq_2", "difficulty")].proposal_json["value"] == "hard"
    assert by[("cq_2", "difficulty")].status == "pending"
    assert "pe_strategy" in rec.bodies()[1]["questions"] and ("cq_2", "pe_strategy") not in by

    updated, applied = apply_approved([q1, q2], props)
    assert updated[0].topic == "valuation" and updated[0].domain is Domain.IB
    assert updated[1].topic is None and applied == 3


def test_taxonomy_auto_approve_threshold_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JEV_AUTO_APPROVE", "0.88")
    rec = Recorder([httpx.Response(200, json=_resp({
        "topic": _choice("valuation", 0.85), "domain": _choice("ib", 0.95),
        "difficulty": _score(1, 0.5)}))])
    props = propose_taxonomy([_q("How do you calculate WACC?", "cq_e")], {}, decider=_decider(rec))
    status = {p.field: p.status for p in props}
    assert status["topic"] == "pending"  # 0.85 < 0.88 even though it agrees
    assert status["domain"] == "approved"  # ≥ 0.9 alone


def test_taxonomy_asks_only_unapproved_fields_and_pe_strategy() -> None:
    # Source difficulty approves difficulty; PE track → domain approved; topic unknown.
    rec = Recorder([httpx.Response(200, json=_resp({
        "topic": _choice("value_creation", 0.93),
        "pe_strategy": _choice("buyout", 0.91),
    }))])
    q = _q("What would you do in the first 100 days after a buyout?", "cq_pe")
    hints = {"cq_pe": SourceHints(track="PE", difficulty="Advanced")}
    props = propose_taxonomy([q], hints, decider=_decider(rec))
    asked = rec.bodies()[0]["questions"]
    assert set(asked) == {"topic", "pe_strategy"}
    assert "difficulty" not in asked and "domain" not in asked
    fields = {p.field: p for p in props}
    assert fields["pe_strategy"].proposal_json["value"] == "buyout"
    assert fields["pe_strategy"].status == "approved"  # alias "Buyout" in wording + ≥ 0.8
    assert fields["difficulty"].prompt_version.startswith("taxonomy-keyword_rules")
    updated, _ = apply_approved([q], props)
    assert updated[0].pe_strategy == "buyout"


def test_taxonomy_jev_failure_keeps_heuristic_and_counts_failed(tmp_path: Path) -> None:
    rec = Recorder([httpx.Response(500, json={})] * 2)
    routes = LlmRouteCounts()
    q = _q("How do you calculate WACC?", "cq_f")
    _, props, metrics = run_taxonomy_enrichment(
        [q], {}, decider=_decider(rec, max_retries=1), routes=routes)
    assert routes.as_dict() == {"heuristic": 0, "jev": 0, "small": 0, "failed": 1}
    assert all(p.prompt_version.startswith("taxonomy-keyword_rules") for p in props)
    assert metrics["taxonomy_mode"] == "jev"


# --------------------------------------------------------------------------- #
# Verification gate (small-model drafts)                                       #
# --------------------------------------------------------------------------- #


def test_verify_request_and_accept_threshold(monkeypatch: pytest.MonkeyPatch) -> None:
    rec = Recorder([
        httpx.Response(200, json=_resp({"support": _choice("supported", 0.85)})),
        httpx.Response(200, json=_resp({"support": _choice("supported", 0.85)})),
        httpx.Response(500, json={}),
    ])
    client = _decider(rec, max_retries=0)
    kw = dict(source="EV = equity + net debt", question="What is EV?", draft="EV adds net debt",
              instructions="Compare", criteria={"supported": "s", "unsupported": "u", "declined": "d"})
    v = client.verify(**kw)
    assert v.choice == "supported" and v.accepted() and v.model == SERVED
    body = rec.bodies()[0]
    assert body["state"] == {"source_teaching_answer": "EV = equity + net debt",
                             "interview_question": "What is EV?", "draft": "EV adds net debt"}
    assert body["questions"]["support"]["type"] == "choice"
    monkeypatch.setenv("JEV_ACCEPT_CONFIDENCE", "0.9")
    assert not client.verify(**kw).accepted()
    failed = client.verify(**kw)  # HTTP 500 → never raises, never accepted
    assert failed.error and not failed.accepted(0.0)
    assert not Verdict("unsupported", 1.0).accepted() and not Verdict("declined", 1.0).accepted()


def test_run_verified_accept_reject_declined() -> None:
    drafts = iter(["d1", "d2", "d3"])
    seen: list[str] = []

    def verdicts(*vs: Verdict) -> Callable[[Any], Verdict]:
        it = iter(vs)

        def verify(value: Any) -> Verdict:
            seen.append(value)
            return next(it)

        return verify

    counts = LlmRouteCounts()
    value, route, vs = run_verified(lambda: next(drafts), verdicts(
        Verdict("unsupported", 0.99), Verdict("supported", 0.95)), attempts=2, counts=counts)
    assert (value, route, len(vs)) == ("d2", "small", 2) and counts.jev_rejected == 1
    # declined → stop, no retry
    value, route, vs = run_verified(lambda: "x", verdicts(Verdict("declined", 0.97)), attempts=2)
    assert value is None and route == "failed" and len(vs) == 1
    # validation failure consumes an attempt without calling Jev
    def bad() -> Any:
        raise LlmValidationError("nope", errors=["x"])

    seen.clear()
    assert run_verified(bad, verdicts(), attempts=2)[:2] == (None, "failed") and seen == []
    # no verifier → never accepted, draft never requested
    called: list[int] = []
    assert run_verified(lambda: called.append(1), None)[1] == "failed" and called == []


# --------------------------------------------------------------------------- #
# llm_enrich graph job + signal tagger                                         #
# --------------------------------------------------------------------------- #


def test_enrich_batch_uses_jev_for_concepts_and_mode(tmp_path: Path) -> None:
    rec = Recorder([
        httpx.Response(200, json=_resp({
            "domain": _choice("pe", 0.9), "difficulty": _score(1, 0.8),
            "concept": _choice("concept_lbo_paper_lbo", 0.92),
            "mode": _choice("concept_learn", 0.8, company_prep=0.1, concept_learn=0.7, both=0.2),
        })),
        httpx.Response(500, json={}),
    ])
    client = _decider(rec, max_retries=0)
    qs = [_q("Walk me through a paper LBO", "q1", topic="lbo"), _q("What is WACC?", "q2")]
    graph, _queue, metrics = run_enrich_batch(qs, decider=client)
    assert metrics["llm_routes"] == {"heuristic": 0, "jev": 1, "small": 0, "failed": 1}
    assert "topic" not in rec.bodies()[0]["questions"]  # q1 already has a topic
    assert {"concept", "mode", "domain", "difficulty"} <= set(rec.bodies()[0]["questions"])
    assert "topic" in rec.bodies()[1]["questions"]
    p1 = next(p for p in graph.proposals if p.canonical_question_id == "q1")
    assert p1.track == "PE" and p1.concepts[0].slug == "lbo-paper-lbo"
    assert p1.concepts[0].prerequisites == ["dcf-wacc"]
    assert p1.mode_routing.modes[0].value == "concept_learn"
    assert p1.mode_routing.company_prep_weight == pytest.approx(0.3)
    assert p1.model_version == SERVED and p1.prompt_version == "enrich-jev-v1"
    assert p1.confidence == pytest.approx(0.8) and p1.metadata["diagram_source"] == "heuristic"
    p2 = next(p for p in graph.proposals if p.canonical_question_id == "q2")
    assert p2.metadata.get("llm_failed") is True and p2.metadata["dry_run"] is True
    assert any(n.concept_slug == "lbo-paper-lbo" for n in graph.concept_lab)
    report = json.loads(write_enrichment_report(graph, metrics, path=tmp_path / "r.json").read_text())
    assert report["job"] == "llm_enrich" and report["metrics"]["llm_routes"]["jev"] == 1


def test_enrich_batch_dry_run_is_all_heuristic() -> None:
    rec = Recorder([])
    decider = DecisionsClient(api_key="", transport=httpx.MockTransport(rec))
    _graph, _queue, metrics = run_enrich_batch([_q("Walk me through a DCF", "q")], decider=decider)
    assert metrics["llm_routes"] == {"heuristic": 1, "jev": 0, "small": 0, "failed": 0}
    assert metrics["dry_run"] is True and rec.requests == []


def test_jev_topic_tagger_batches_and_thresholds() -> None:
    rec = Recorder([
        httpx.Response(200, json=_resp({"s1": _choice("markets", 0.9), "s2": _choice("lbo", 0.5)})),
        httpx.Response(200, json=_resp({"s1": _choice("credit", 0.95)})),
    ])
    tagger = jev_topic_tagger(_decider(rec), batch_size=2)
    assert tagger(["Where is the S&P going?", "What is a thing?", "Tell me about bonds"]) == [
        "markets", None, "credit"]
    body = rec.bodies()[0]
    assert body["state"] == {"signals": {"s1": "Where is the S&P going?", "s2": "What is a thing?"}}
    assert set(body["questions"]) == {"s1", "s2"}
    assert getattr(tagger, "method") == "jev"
