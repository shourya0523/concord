"""OpenRouter Decisions API client for Jev (TypeSafe ``typesafe/jev-1.13``).

Jev is a *decision* model, not an LLM (ADR 0007, ``docs/vendor/jev/``): it takes a
``state`` object plus typed ``questions`` and returns one typed answer per
question — no text to parse, no output tokens billed (input only, ~$0.042/M).

* ``noul``   → ``{"type": "noul", "noul": p_yes}``
* ``choice`` → ``{"type": "choice", "choice": label, "confidence", "probabilities"}``
* ``score``  → ``{"type": "score", "score": position, "confidence", "probabilities", "legend"}``

All questions in one request are answered independently and in parallel, so a
caller puts every question about the same state into ONE request.

Endpoint: ``POST https://openrouter.ai/api/alpha/decisions`` — outside the
``/api/v1`` prefix the chat client uses. Resolution order:
``OPENROUTER_DECISIONS_URL`` → origin of ``OPENROUTER_BASE_URL`` +
``/api/alpha/decisions`` → the public default. Model: ``LLM_DECISION_MODEL``
(default ``typesafe/jev-1.13``; pin a version so thresholds stay calibrated).

429 / 5xx (incl. 529) / 408 / transport errors and the transient in-flight
budget ``402`` are retried with exponential backoff (``Retry-After`` honoured).
Errors are typed (:class:`DecisionError` subclasses of
:class:`~ibpe_corpus.answers.llm_client.LlmError`) and never carry the key; the
key lives only in the ``Authorization`` header.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Annotated, Any, Callable, Literal, Mapping, Union
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel, Field, ValidationError

from ibpe_corpus.answers.llm_client import (
    APP_TITLE,
    OPENROUTER_BASE_URL_DEFAULT,
    LlmError,
)

log = logging.getLogger(__name__)

DECISION_MODEL_DEFAULT = "typesafe/jev-1.13"
DECISIONS_PATH = "/api/alpha/decisions"
DECISIONS_URL_DEFAULT = "https://openrouter.ai" + DECISIONS_PATH

# Confidence gates (env-tunable; start at the cookbook's 0.8 and tune on traffic).
JEV_AUTO_APPROVE_DEFAULT = 0.8
JEV_ACCEPT_CONFIDENCE_DEFAULT = 0.8
# A Jev answer this confident is approved even when the keyword rules disagree
# or have no opinion.
JEV_SOLO_APPROVE = 0.9

__all__ = [
    "ChoiceAnswer",
    "ChoiceQuestion",
    "DECISION_MODEL_DEFAULT",
    "DECISIONS_URL_DEFAULT",
    "DecisionAuthError",
    "DecisionConfigError",
    "DecisionError",
    "DecisionHTTPError",
    "DecisionRateLimitError",
    "DecisionResponse",
    "DecisionResponseError",
    "DecisionTransportError",
    "DecisionUsage",
    "DecisionsClient",
    "JEV_SOLO_APPROVE",
    "NoulAnswer",
    "NoulQuestion",
    "ScoreAnswer",
    "ScoreQuestion",
    "Verdict",
    "decide",
    "decision_model",
    "decisions_url",
    "jev_accept_confidence",
    "jev_auto_approve",
]


# --------------------------------------------------------------------------- #
# Errors                                                                      #
# --------------------------------------------------------------------------- #


class DecisionError(LlmError):
    """Base class for Decisions API failures (messages never carry the key)."""


class DecisionConfigError(DecisionError):
    """No ``OPENROUTER_API_KEY`` (or the client is in dry-run mode)."""


class DecisionTransportError(DecisionError):
    """Network / timeout failure after retries."""


class DecisionHTTPError(DecisionError):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"Decisions HTTP {status}: {message}")
        self.status = status


class DecisionAuthError(DecisionHTTPError):
    """401 / 403 — bad or missing key."""


class DecisionRateLimitError(DecisionHTTPError):
    """429 (or transient 402 in-flight budget) after all retries."""


class DecisionResponseError(DecisionError):
    """Envelope without the expected typed answers."""


# --------------------------------------------------------------------------- #
# Config                                                                      #
# --------------------------------------------------------------------------- #


def _env_float(name: str, default: float) -> float:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        log.warning("%s=%r is not a number; using %s", name, raw, default)
        return default
    return max(0.0, min(1.0, value))


def jev_auto_approve() -> float:
    """``JEV_AUTO_APPROVE`` (default 0.8): taxonomy auto-approve bar (with rule agreement)."""
    return _env_float("JEV_AUTO_APPROVE", JEV_AUTO_APPROVE_DEFAULT)


def jev_accept_confidence() -> float:
    """``JEV_ACCEPT_CONFIDENCE`` (default 0.8): verification bar for small-model drafts."""
    return _env_float("JEV_ACCEPT_CONFIDENCE", JEV_ACCEPT_CONFIDENCE_DEFAULT)


def decision_model() -> str:
    return (os.environ.get("LLM_DECISION_MODEL") or "").strip() or DECISION_MODEL_DEFAULT


def decisions_url(base_url: str | None = None) -> str:
    """Decisions endpoint: explicit env URL, else the origin of the chat base URL."""
    explicit = (os.environ.get("OPENROUTER_DECISIONS_URL") or "").strip()
    if explicit:
        return explicit.rstrip("/")
    base = (base_url or os.environ.get("OPENROUTER_BASE_URL") or OPENROUTER_BASE_URL_DEFAULT).strip()
    parts = urlsplit(base)
    if not parts.scheme or not parts.netloc:
        return DECISIONS_URL_DEFAULT
    return f"{parts.scheme}://{parts.netloc}{DECISIONS_PATH}"


# --------------------------------------------------------------------------- #
# Questions (request) + answers (response)                                    #
# --------------------------------------------------------------------------- #


class NoulQuestion(BaseModel):
    type: Literal["noul"] = "noul"
    instructions: str
    criteria: dict[Literal["true", "false"], str] | None = None


class ChoiceQuestion(BaseModel):
    type: Literal["choice"] = "choice"
    instructions: str
    criteria: dict[str, str] = Field(min_length=2)


class ScoreQuestion(BaseModel):
    type: Literal["score"] = "score"
    instructions: str
    criteria: list[str] = Field(min_length=2)


Question = Union[NoulQuestion, ChoiceQuestion, ScoreQuestion]


class NoulAnswer(BaseModel):
    type: Literal["noul"]
    noul: float = Field(ge=0.0, le=1.0)


class ChoiceAnswer(BaseModel):
    type: Literal["choice"]
    choice: str
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    probabilities: dict[str, float] = Field(default_factory=dict)

    @property
    def conf(self) -> float:
        """Confidence with a missing value treated as 0 (fails every gate)."""
        return float(self.confidence or 0.0)


class ScoreAnswer(BaseModel):
    type: Literal["score"]
    score: float
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    probabilities: dict[str, float] = Field(default_factory=dict)
    legend: dict[str, str] = Field(default_factory=dict)

    @property
    def conf(self) -> float:
        return float(self.confidence or 0.0)

    def index(self, n_levels: int) -> int:
        """Nearest level index (0-based) on an ``n_levels`` scale."""
        return max(0, min(n_levels - 1, int(round(self.score))))


AnswerT = Annotated[Union[NoulAnswer, ChoiceAnswer, ScoreAnswer], Field(discriminator="type")]


class DecisionUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    cost: float | None = None


class DecisionResponse(BaseModel):
    id: str | None = None
    model: str = ""
    provider: str | None = None
    answers: dict[str, AnswerT] = Field(default_factory=dict)
    usage: DecisionUsage = Field(default_factory=DecisionUsage)

    def choice(self, key: str) -> ChoiceAnswer:
        ans = self.answers[key]
        assert isinstance(ans, ChoiceAnswer)
        return ans

    def score(self, key: str) -> ScoreAnswer:
        ans = self.answers[key]
        assert isinstance(ans, ScoreAnswer)
        return ans

    def noul(self, key: str) -> NoulAnswer:
        ans = self.answers[key]
        assert isinstance(ans, NoulAnswer)
        return ans


def _question_wire(q: Question | Mapping[str, Any]) -> dict[str, Any]:
    if isinstance(q, BaseModel):
        return q.model_dump(mode="json", exclude_none=True)
    return dict(q)


def _check_answers(resp: DecisionResponse, questions: Mapping[str, dict[str, Any]]) -> None:
    """Every asked question answered with the asked type and a known label."""
    for key, q in questions.items():
        ans = resp.answers.get(key)
        if ans is None:
            raise DecisionResponseError(f"Decisions response has no answer for {key!r}")
        if ans.type != q.get("type"):
            raise DecisionResponseError(f"answer {key!r} is {ans.type}, asked {q.get('type')}")
        if isinstance(ans, ChoiceAnswer) and ans.choice not in (q.get("criteria") or {}):
            raise DecisionResponseError(f"answer {key!r} chose an unknown label")


# --------------------------------------------------------------------------- #
# Verification (cookbook: Jev-verified cascade)                               #
# --------------------------------------------------------------------------- #

VERDICT_LABELS = ("supported", "unsupported", "declined")


@dataclass
class Verdict:
    """Jev's verdict on one model draft (``supported`` | ``unsupported`` | ``declined``)."""

    choice: str
    confidence: float
    probabilities: dict[str, float] = field(default_factory=dict)
    model: str | None = None
    error: str | None = None  # set when verification itself failed

    def accepted(self, threshold: float | None = None) -> bool:
        bar = jev_accept_confidence() if threshold is None else threshold
        return self.error is None and self.choice == "supported" and self.confidence >= bar

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "choice": self.choice,
            "confidence": round(self.confidence, 4),
            "probabilities": self.probabilities,
            "model": self.model,
        }
        if self.error:
            out["error"] = self.error
        return out


# --------------------------------------------------------------------------- #
# HTTP client                                                                 #
# --------------------------------------------------------------------------- #

_RETRY_STATUSES = {408, 409, 425, 429}


def _in_flight_budget(data: Any) -> bool:
    if not isinstance(data, dict):
        return False
    err = data.get("error")
    meta = err.get("metadata") if isinstance(err, dict) else None
    return isinstance(meta, dict) and meta.get("limit_source") == "openrouter_in_flight_budget"


class DecisionsClient:
    """``POST /api/alpha/decisions`` with typed answers, retries and usage totals."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        url: str | None = None,
        model: str | None = None,
        timeout: float = 60.0,
        max_retries: int = 4,
        backoff_base: float = 1.0,
        max_backoff: float = 30.0,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
        dry_run: bool = False,
    ) -> None:
        key = api_key if api_key is not None else os.environ.get("OPENROUTER_API_KEY")
        self.__api_key = (key or "").strip() or None
        self.url = (url or decisions_url()).rstrip("/")
        self.model = model or decision_model()
        self.timeout = timeout
        self.max_retries = max(0, int(max_retries))
        self.backoff_base = backoff_base
        self.max_backoff = max_backoff
        self._transport = transport
        self._sleep = sleep
        self._http: httpx.Client | None = None
        self.dry_run = dry_run or not self.__api_key
        self.usage: dict[str, Any] = {
            "requests": 0,
            "retries": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "cost": 0.0,
            "by_model": {},
        }

    def __repr__(self) -> str:  # never include the key
        return f"{type(self).__name__}(url={self.url!r}, model={self.model!r}, dry_run={self.dry_run})"

    # -- transport --------------------------------------------------------- #

    def _headers(self) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.__api_key}",
            "Content-Type": "application/json",
            "X-Title": APP_TITLE,
        }
        referer = (os.environ.get("OPENROUTER_REFERER") or "").strip()
        if referer:
            headers["HTTP-Referer"] = referer
        return headers

    def _client(self) -> httpx.Client:
        if self._http is None:
            self._http = httpx.Client(timeout=self.timeout, transport=self._transport)
        return self._http

    def close(self) -> None:
        if self._http is not None:
            self._http.close()
            self._http = None

    def _scrub(self, text: str) -> str:
        key = self.__api_key
        if key and key in text:
            text = text.replace(key, "***")
        return text[:300]

    def _delay(self, attempt: int, retry_after: str | None) -> float:
        if retry_after:
            try:
                return min(self.max_backoff, max(0.0, float(retry_after)))
            except ValueError:
                pass  # HTTP-date Retry-After is ignored (cookbook behaviour)
        return min(self.max_backoff, self.backoff_base * (2**attempt))

    @staticmethod
    def _error_message(data: Any, fallback: str) -> str:
        if isinstance(data, dict):
            err = data.get("error")
            if isinstance(err, dict):
                return str(err.get("message") or err.get("code") or fallback)
            if err:
                return str(err)
        return fallback

    def build_body(
        self,
        state: Mapping[str, Any],
        questions: Mapping[str, Question | Mapping[str, Any]],
        *,
        model: str | None = None,
    ) -> dict[str, Any]:
        if not questions:
            raise ValueError("at least one question is required")
        return {
            "model": model or self.model,
            "state": dict(state),
            "questions": {k: _question_wire(q) for k, q in questions.items()},
        }

    def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        if self.dry_run:
            raise DecisionConfigError("OPENROUTER_API_KEY is not configured (dry-run mode)")
        last: DecisionError | None = None
        for attempt in range(self.max_retries + 1):
            if attempt:
                self.usage["retries"] += 1
            retry_after: str | None = None
            try:
                self.usage["requests"] += 1
                resp = self._client().post(self.url, headers=self._headers(), json=body)
            except httpx.TransportError as exc:
                last = DecisionTransportError(f"Decisions transport error: {type(exc).__name__}")
            else:
                status = resp.status_code
                try:
                    data = resp.json()
                except ValueError:
                    data = None
                transient = (
                    status in _RETRY_STATUSES
                    or status >= 500
                    or (status == 402 and _in_flight_budget(data))
                )
                if transient:
                    retry_after = resp.headers.get("retry-after")
                    msg = self._scrub(self._error_message(data, resp.reason_phrase or "error"))
                    last = (
                        DecisionRateLimitError(status, msg)
                        if status in {429, 402}
                        else DecisionHTTPError(status, msg)
                    )
                elif status in {401, 403}:
                    raise DecisionAuthError(status, self._scrub(self._error_message(data, "unauthorised")))
                elif status >= 400:
                    raise DecisionHTTPError(status, self._scrub(self._error_message(data, "request failed")))
                elif not isinstance(data, dict):
                    raise DecisionResponseError("Decisions API returned a non-JSON body")
                elif data.get("error") and not data.get("answers"):
                    msg = self._scrub(self._error_message(data, "upstream error"))
                    raise DecisionResponseError(f"Decisions upstream error: {msg}")
                else:
                    return data
            if attempt < self.max_retries:
                delay = self._delay(attempt, retry_after)
                log.info("decisions retry %d/%d in %.1fs (%s)", attempt + 1, self.max_retries, delay,
                         type(last).__name__)
                self._sleep(delay)
        assert last is not None
        raise last

    def _record_usage(self, resp: DecisionResponse, requested: str) -> None:
        served = resp.model or requested
        self.usage["input_tokens"] += int(resp.usage.input_tokens or 0)
        self.usage["output_tokens"] += int(resp.usage.output_tokens or 0)
        self.usage["cost"] = round(self.usage["cost"] + float(resp.usage.cost or 0.0), 10)
        by_model = self.usage["by_model"]
        by_model[served] = by_model.get(served, 0) + 1

    # -- public API -------------------------------------------------------- #

    def decide(
        self,
        state: Mapping[str, Any],
        questions: Mapping[str, Question | Mapping[str, Any]],
        model: str | None = None,
    ) -> DecisionResponse:
        """One Decisions request; every question about ``state`` in one call."""
        body = self.build_body(state, questions, model=model)
        data = self._post(body)
        try:
            resp = DecisionResponse.model_validate(data)
        except ValidationError as exc:
            errs = [f"{'.'.join(str(p) for p in e['loc'])}:{e['type']}" for e in exc.errors()[:5]]
            raise DecisionResponseError(f"Decisions response failed validation: {errs}") from None
        _check_answers(resp, body["questions"])
        self._record_usage(resp, body["model"])
        return resp

    def verify(
        self,
        *,
        source: str,
        question: str,
        draft: str,
        instructions: str,
        criteria: Mapping[str, str],
    ) -> Verdict:
        """Cookbook verification: ``choice`` over supported / unsupported / declined.

        Never raises: a failed call returns a verdict with ``error`` set, which
        :meth:`Verdict.accepted` rejects (unverified drafts are never accepted).
        """
        assert set(criteria) == set(VERDICT_LABELS)
        try:
            resp = self.decide(
                {"source_teaching_answer": source, "interview_question": question, "draft": draft},
                {"support": ChoiceQuestion(instructions=instructions, criteria=dict(criteria))},
            )
        except LlmError as exc:
            log.warning("jev verification failed: %s", type(exc).__name__)
            return Verdict(choice="unverified", confidence=0.0, error=type(exc).__name__)
        ans = resp.choice("support")
        return Verdict(
            choice=ans.choice,
            confidence=ans.conf,
            probabilities=dict(ans.probabilities),
            model=resp.model or self.model,
        )


def decide(
    state: Mapping[str, Any],
    questions: Mapping[str, Question | Mapping[str, Any]],
    model: str | None = None,
    *,
    client: DecisionsClient | None = None,
) -> DecisionResponse:
    """Module-level convenience: one Decisions request with a default client."""
    own = client is None
    c = client or DecisionsClient()
    try:
        return c.decide(state, questions, model=model)
    finally:
        if own:
            c.close()
