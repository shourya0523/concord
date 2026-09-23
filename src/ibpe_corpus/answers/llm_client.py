"""OpenRouter chat client — the *small* LLM tier, used only when text is required.

Cost-optimised stack (ADR 0007):

* **Jev** (``typesafe/jev-1.13`` via the Decisions API,
  :mod:`ibpe_corpus.answers.decisions_client`) makes every classification /
  routing / verification decision — taxonomy, concept and mode routing, signal
  topic tags, and the accept/reject gate on model drafts.
* **small** — ``LLM_SMALL_MODEL`` (default ``deepseek/deepseek-v4-flash``) —
  only for outputs that need *text* (rubric drafts, answer-expansion appendices,
  optional diagram drafts), only when the deterministic heuristic fails
  validation, and **always Jev-verified** against the source teaching answer
  (:func:`run_verified`). There is no larger chat tier.

Every request goes to ``{OPENROUTER_BASE_URL}/chat/completions`` with a strict
``json_schema`` response format generated from a Pydantic model, a
``models`` fallback list (small model, then ``LLM_FALLBACK_MODEL``) and
``usage.include`` so cost is reported. Replies are validated with Pydantic;
429 / 5xx / transport errors are retried with exponential backoff. The API key
is only ever placed in the ``Authorization`` header — never logged, never in
``repr`` or exception messages.
"""

from __future__ import annotations

import logging
import os
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Generic, Sequence, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from ibpe_corpus.answers.enrich_models import (
    ConceptHint,
    DiagramDraft,
    EnrichDraft,
    EnrichmentProposal,
    LearningMode,
    ModeRouting,
)
from ibpe_corpus.answers.provenance import label_enrichment_record
from ibpe_corpus.schemas.models import CanonicalQuestion

log = logging.getLogger(__name__)

OPENROUTER_BASE_URL_DEFAULT = "https://openrouter.ai/api/v1"
SMALL_MODEL_DEFAULT = "deepseek/deepseek-v4-flash"
FALLBACK_MODEL_DEFAULT = "google/gemini-2.5-flash-lite"
APP_TITLE = "Concord"

ENRICH_PROMPT_VERSION = "enrich-v1"
LLM_ENRICH_SOURCE_ID = "openrouter_enrichment_v1"

__all__ = [
    "APP_TITLE",
    "ENRICH_PROMPT_VERSION",
    "FALLBACK_MODEL_DEFAULT",
    "JsonCaller",
    "LLM_ENRICH_SOURCE_ID",
    "LlmAuthError",
    "LlmConfigError",
    "LlmError",
    "LlmHTTPError",
    "LlmRateLimitError",
    "LlmResponseError",
    "LlmResult",
    "LlmRouteCounts",
    "LlmTransportError",
    "LlmValidationError",
    "OPENROUTER_BASE_URL_DEFAULT",
    "OpenRouterClient",
    "ROUTES",
    "SMALL_MODEL_DEFAULT",
    "Tier",
    "credentials_configured",
    "heuristic_proposal",
    "resolve_model_id",
    "run_verified",
    "strict_json_schema",
    "validate_enrich_draft",
]

T = TypeVar("T", bound=BaseModel)


class Tier(str, Enum):
    """Chat tiers. Only ``small`` remains: decisions go to Jev, not a bigger LLM."""

    SMALL = "small"


# --------------------------------------------------------------------------- #
# Errors                                                                      #
# --------------------------------------------------------------------------- #


class LlmError(RuntimeError):
    """Base class for OpenRouter client failures (messages never carry the key)."""


class LlmConfigError(LlmError):
    """No ``OPENROUTER_API_KEY`` (or the client is in dry-run mode)."""


class LlmTransportError(LlmError):
    """Network / timeout failure after retries."""


class LlmHTTPError(LlmError):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"OpenRouter HTTP {status}: {message}")
        self.status = status


class LlmAuthError(LlmHTTPError):
    """401 / 403 — bad or missing key."""


class LlmRateLimitError(LlmHTTPError):
    """429 after all retries."""


class LlmResponseError(LlmError):
    """Envelope without choices / content (not a model-quality problem)."""


class LlmValidationError(LlmError):
    """Model reply was not valid JSON or failed schema / domain validation.

    The only error that lets :func:`run_verified` retry the small model.
    """

    def __init__(self, message: str, *, errors: Sequence[str] = (), model: str | None = None) -> None:
        super().__init__(message)
        self.errors = list(errors)
        self.model = model


# --------------------------------------------------------------------------- #
# Config                                                                      #
# --------------------------------------------------------------------------- #


def credentials_configured() -> bool:
    """True when an OpenRouter key is available to worker jobs."""
    return bool((os.environ.get("OPENROUTER_API_KEY") or "").strip())


def resolve_model_id(tier: Tier | str | None = None) -> str:
    """Small chat model id from ``LLM_SMALL_MODEL`` (the only chat tier)."""
    if tier not in (None, "", Tier.SMALL, "small"):
        raise ValueError(f"unknown LLM tier {tier!r} (only 'small'; decisions use Jev)")
    return (os.environ.get("LLM_SMALL_MODEL") or "").strip() or SMALL_MODEL_DEFAULT


def _fallback_from_env() -> str | None:
    raw = os.environ.get("LLM_FALLBACK_MODEL")
    if raw is None:
        return FALLBACK_MODEL_DEFAULT
    return raw.strip() or None  # empty string disables the fallback


# --------------------------------------------------------------------------- #
# Structured output                                                           #
# --------------------------------------------------------------------------- #

# Dropped from the wire schema: defaults (strict mode requires every field) and
# validation keywords that some OpenRouter providers reject in strict mode. The
# Pydantic model still enforces all of them when the reply is validated.
_DROP_KEYS = {
    "default",
    "examples",
    "minLength",
    "maxLength",
    "pattern",
    "format",
    "minItems",
    "maxItems",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
}


def _strictify(node: Any) -> Any:
    if isinstance(node, list):
        return [_strictify(n) for n in node]
    if not isinstance(node, dict):
        return node
    if "$ref" in node:
        # Strict mode forbids siblings next to $ref.
        return {"$ref": node["$ref"]}
    out: dict[str, Any] = {}
    for k, v in node.items():
        if k in _DROP_KEYS:
            continue
        if k in {"properties", "$defs"} and isinstance(v, dict):
            # Name → schema maps: recurse into the schemas, not the map itself.
            out[k] = {name: _strictify(sub) for name, sub in v.items()}
        else:
            out[k] = _strictify(v)
    if out.get("type") == "object" or isinstance(out.get("properties"), dict):
        props = out.get("properties") or {}
        out["properties"] = props
        out["required"] = list(props)
        out["additionalProperties"] = False
    return out


def strict_json_schema(model: type[BaseModel]) -> dict[str, Any]:
    """``model_json_schema()`` rewritten for ``json_schema`` strict mode.

    Every object lists all properties as required and forbids extras; defaults
    and range/length constraints are dropped from the wire schema (the Pydantic
    model still applies and enforces them on validation).
    """
    return _strictify(model.model_json_schema())


def _schema_name(model: type[BaseModel]) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", model.__name__)[:64]


_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL)


def _message_text(content: Any) -> str:
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        text = "".join(
            str(p.get("text") or "") for p in content if isinstance(p, dict)
        )
    else:
        text = ""
    m = _FENCE_RE.match(text)
    return m.group(1) if m else text


# --------------------------------------------------------------------------- #
# Results + routing                                                           #
# --------------------------------------------------------------------------- #


@dataclass
class LlmResult(Generic[T]):
    value: T
    model: str  # model OpenRouter actually served (may be the fallback)
    tier: Tier
    requested_model: str
    usage: dict[str, Any] = field(default_factory=dict)
    response_id: str | None = None


ROUTES = ("heuristic", "jev", "small", "failed")


@dataclass
class LlmRouteCounts:
    """Which path settled each enrichment item (reported per job / stage).

    ``heuristic`` — deterministic rules, no network; ``jev`` — a Jev decision
    (taxonomy / routing); ``small`` — a small-model draft that Jev verified as
    supported; ``failed`` — a model path was tried and the heuristic was kept
    (network error, validation failure, or Jev rejected every draft).
    ``jev_rejected`` counts individual drafts Jev refused (not a route).
    """

    heuristic: int = 0
    jev: int = 0
    small: int = 0
    failed: int = 0
    jev_rejected: int = 0

    def record(self, route: str | Tier) -> None:
        key = route.value if isinstance(route, Tier) else str(route)
        if key not in ROUTES:
            raise ValueError(f"unknown LLM route {route!r}")
        setattr(self, key, getattr(self, key) + 1)

    def merge(self, other: "LlmRouteCounts") -> "LlmRouteCounts":
        return LlmRouteCounts(
            heuristic=self.heuristic + other.heuristic,
            jev=self.jev + other.jev,
            small=self.small + other.small,
            failed=self.failed + other.failed,
            jev_rejected=self.jev_rejected + other.jev_rejected,
        )

    @property
    def llm_calls_attempted(self) -> int:
        return self.jev + self.small + self.failed

    def as_dict(self) -> dict[str, int]:
        return {k: getattr(self, k) for k in ROUTES}


def run_verified(
    draft: Callable[[], Any],
    verify: Callable[[Any], Any] | None,
    *,
    attempts: int = 1,
    threshold: float | None = None,
    counts: LlmRouteCounts | None = None,
) -> tuple[Any, str, list[Any]]:
    """Small-model draft → Jev verification (cookbook "verified cascade").

    ``draft()`` returns a validated value, ``None`` (unusable) or raises
    :class:`LlmValidationError` (same); any other exception is a hard failure
    (network, auth, rate limit after retries) and stops. ``verify(value)``
    returns a :class:`~ibpe_corpus.answers.decisions_client.Verdict`; only
    ``supported`` at or above ``threshold`` (``JEV_ACCEPT_CONFIDENCE``) is
    accepted. A ``declined`` verdict (or a failed verification call) stops;
    anything else is retried with the small model while ``attempts`` remain
    (``--escalate`` → 2 attempts). Without a verifier nothing is accepted.

    Returns ``(value | None, route, verdicts)`` with route ``small`` / ``failed``.
    """
    verdicts: list[Any] = []
    if verify is None:
        return None, "failed", verdicts
    for n in range(max(1, attempts)):
        try:
            value = draft()
        except LlmValidationError as exc:
            log.info("small draft %d failed validation: %s", n + 1, exc.errors[:3])
            continue
        except Exception as exc:  # noqa: BLE001 — hard failure → heuristic
            log.warning("small model call failed: %s", type(exc).__name__)
            return None, "failed", verdicts
        if value is None:
            continue
        verdict = verify(value)
        verdicts.append(verdict)
        if verdict.accepted(threshold):
            return value, "small", verdicts
        if counts is not None:
            counts.jev_rejected += 1
        log.info("jev rejected small draft %d: %s @ %.2f", n + 1, verdict.choice, verdict.confidence)
        if verdict.choice == "declined" or verdict.error:
            break
    return None, "failed", verdicts


# --------------------------------------------------------------------------- #
# HTTP client                                                                 #
# --------------------------------------------------------------------------- #

_UNSET: Any = object()
_RETRY_STATUSES = {408, 409, 425, 429, 500, 502, 503, 504, 520, 522, 524, 529}


class OpenRouterClient:
    """OpenRouter chat-completions client (small tier) with fallback and retries."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        small_model: str | None = None,
        fallback_model: str | None = _UNSET,
        escalate: bool = True,
        timeout: float = 60.0,
        max_retries: int = 3,
        backoff_base: float = 1.0,
        max_backoff: float = 30.0,
        temperature: float = 0.2,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
        dry_run: bool = False,
    ) -> None:
        key = api_key if api_key is not None else os.environ.get("OPENROUTER_API_KEY")
        self.__api_key = (key or "").strip() or None
        self.base_url = (
            base_url or os.environ.get("OPENROUTER_BASE_URL") or OPENROUTER_BASE_URL_DEFAULT
        ).rstrip("/")
        self.small_model = small_model or resolve_model_id(Tier.SMALL)
        self.fallback_model = _fallback_from_env() if fallback_model is _UNSET else fallback_model
        # ``--escalate``: a draft Jev rejects (or that fails validation) is
        # retried once with the small model — there is no bigger chat tier.
        self.escalate = escalate
        self.timeout = timeout
        self.max_retries = max(0, int(max_retries))
        self.backoff_base = backoff_base
        self.max_backoff = max_backoff
        self.temperature = temperature
        self._transport = transport
        self._sleep = sleep
        self._http: httpx.Client | None = None
        self.dry_run = dry_run or not self.__api_key
        self.usage: dict[str, Any] = {
            "requests": 0,
            "retries": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "cost": 0.0,
            "by_model": {},
        }

    # -- identity ---------------------------------------------------------- #

    def __repr__(self) -> str:  # never include the key
        return (
            f"{type(self).__name__}(base_url={self.base_url!r}, small={self.small_model!r}, "
            f"escalate={self.escalate}, dry_run={self.dry_run})"
        )

    @property
    def model(self) -> str:
        """Configured small model (reports / legacy callers)."""
        return self.small_model

    @property
    def draft_attempts(self) -> int:
        """Small-model attempts per item: 2 with ``--escalate`` (retry once), else 1."""
        return 2 if self.escalate else 1

    def models_for(self) -> list[str]:
        out = [self.small_model]
        if self.fallback_model and self.fallback_model != self.small_model:
            out.append(self.fallback_model)
        return out

    # -- request ----------------------------------------------------------- #

    @property
    def endpoint(self) -> str:
        return f"{self.base_url}/chat/completions"

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

    def build_body(
        self,
        prompt: str,
        schema: type[BaseModel],
        *,
        system: str | None = None,
        temperature: float | None = None,
    ) -> dict[str, Any]:
        models = self.models_for()
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return {
            "model": models[0],
            "models": models,
            "messages": messages,
            "temperature": self.temperature if temperature is None else temperature,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": _schema_name(schema),
                    "strict": True,
                    "schema": strict_json_schema(schema),
                },
            },
            "usage": {"include": True},
        }

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
                pass
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

    def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        """POST with retry/backoff on 429, 5xx and transport errors."""
        if self.dry_run:
            raise LlmConfigError("OPENROUTER_API_KEY is not configured (dry-run mode)")
        last: LlmError | None = None
        for attempt in range(self.max_retries + 1):
            if attempt:
                self.usage["retries"] += 1
            retry_after: str | None = None
            try:
                self.usage["requests"] += 1
                resp = self._client().post(self.endpoint, headers=self._headers(), json=body)
            except httpx.TransportError as exc:
                last = LlmTransportError(f"OpenRouter transport error: {type(exc).__name__}")
            else:
                status = resp.status_code
                try:
                    data = resp.json()
                except ValueError:
                    data = None
                if status in _RETRY_STATUSES:
                    retry_after = resp.headers.get("retry-after")
                    msg = self._scrub(self._error_message(data, resp.reason_phrase or "error"))
                    last = (
                        LlmRateLimitError(status, msg) if status == 429 else LlmHTTPError(status, msg)
                    )
                elif status in {401, 403}:
                    raise LlmAuthError(status, self._scrub(self._error_message(data, "unauthorised")))
                elif status >= 400:
                    raise LlmHTTPError(status, self._scrub(self._error_message(data, "request failed")))
                elif not isinstance(data, dict):
                    raise LlmResponseError("OpenRouter returned a non-JSON body")
                elif data.get("error") and not data.get("choices"):
                    # OpenRouter can surface upstream errors inside a 200 envelope.
                    err = data["error"] if isinstance(data["error"], dict) else {}
                    code = int(err.get("code") or 0) if str(err.get("code") or "").isdigit() else 0
                    msg = self._scrub(self._error_message(data, "upstream error"))
                    if code in _RETRY_STATUSES:
                        last = LlmRateLimitError(code, msg) if code == 429 else LlmHTTPError(code, msg)
                    else:
                        raise LlmResponseError(f"OpenRouter upstream error: {msg}")
                else:
                    return data
            if attempt < self.max_retries:
                delay = self._delay(attempt, retry_after)
                log.info("openrouter retry %d/%d in %.1fs (%s)", attempt + 1, self.max_retries, delay,
                         type(last).__name__)
                self._sleep(delay)
        assert last is not None
        raise last

    def _record_usage(self, data: dict[str, Any], model: str) -> dict[str, Any]:
        usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
        self.usage["prompt_tokens"] += int(usage.get("prompt_tokens") or 0)
        self.usage["completion_tokens"] += int(usage.get("completion_tokens") or 0)
        self.usage["cost"] = round(self.usage["cost"] + float(usage.get("cost") or 0.0), 8)
        by_model = self.usage["by_model"]
        by_model[model] = by_model.get(model, 0) + 1
        return dict(usage)

    def complete(
        self,
        prompt: str,
        schema: type[T],
        *,
        system: str | None = None,
        temperature: float | None = None,
    ) -> LlmResult[T]:
        """One structured completion from the small model, validated against ``schema``."""
        t = Tier.SMALL
        body = self.build_body(prompt, schema, system=system, temperature=temperature)
        requested = body["model"]
        data = self._post(body)
        served = str(data.get("model") or requested)
        usage = self._record_usage(data, served)
        choices = data.get("choices") or []
        if not choices or not isinstance(choices[0], dict):
            raise LlmResponseError("OpenRouter response has no choices")
        message = choices[0].get("message") or {}
        text = _message_text(message.get("content"))
        if not text.strip():
            raise LlmValidationError("empty model reply", errors=["empty_reply"], model=served)
        try:
            value = schema.model_validate_json(text)
        except ValidationError as exc:
            errs = [f"{'.'.join(str(p) for p in e['loc'])}:{e['type']}" for e in exc.errors()[:10]]
            raise LlmValidationError(
                f"{schema.__name__} validation failed", errors=errs, model=served
            ) from None
        log.debug("openrouter ok model=%s", served)
        return LlmResult(
            value=value,
            model=served,
            tier=t,
            requested_model=requested,
            usage=usage,
            response_id=data.get("id"),
        )

    def json_caller(self, schema: type[BaseModel]) -> "JsonCaller":
        return JsonCaller(self, schema)


class JsonCaller:
    """``prompt -> dict`` adapter for prompt modules (rubric-v1, signal-topic-v1).

    Keeps the plain-callable interface those modules accept while exposing
    the model OpenRouter actually served (``last_model``) and the number of
    small-model attempts the client allows (``attempts``: 2 with ``--escalate``).
    """

    tier = Tier.SMALL

    def __init__(self, client: OpenRouterClient, schema: type[BaseModel]) -> None:
        self.client = client
        self.schema = schema
        self.last_model: str | None = None

    @property
    def model(self) -> str:
        return self.client.small_model

    @property
    def attempts(self) -> int:
        return self.client.draft_attempts

    def __call__(self, prompt: str) -> dict[str, Any]:
        result = self.client.complete(prompt, self.schema)
        self.last_model = result.model
        return result.value.model_dump(mode="json")


# --------------------------------------------------------------------------- #
# enrich-v1 (heuristic skeleton + validators)                                 #
# --------------------------------------------------------------------------- #

_MERMAID_RE = re.compile(
    r"^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|pie|mindmap|timeline)\b"
)


def validate_enrich_draft(draft: EnrichDraft) -> list[str]:
    """Domain checks beyond the JSON schema (empty list = valid)."""
    from ibpe_corpus.answers.taxonomy_enrich import normalise_topic

    errors: list[str] = []
    if normalise_topic(draft.topic) is None:
        errors.append(f"unknown_topic:{draft.topic}")
    for d in draft.diagram_drafts:
        if d.spec and not _MERMAID_RE.match(d.spec):
            errors.append("diagram_not_mermaid")
    for r in draft.resource_drafts:
        if not r.url.startswith("https://"):
            errors.append("resource_url_not_https")
    rewrite = (draft.interview_ready_rewrite or "").lower()
    if "glassdoor" in rewrite:
        errors.append("glassdoor_attribution")
    return errors


def heuristic_proposal(question: CanonicalQuestion, *, model: str | None = None) -> EnrichmentProposal:
    """Offline / no-key skeleton: deterministic tags from wording (confidence 0.35)."""
    blob = " ".join(
        filter(None, [question.canonical_wording, question.topic, question.subtopic])
    ).lower()
    topic = question.topic or "general"
    slug = topic.replace(" ", "-").lower() if topic else "general"
    is_pe = any(k in blob for k in ("lbo", "moic", "irr", "buyout", "sponsor"))
    is_ib = any(k in blob for k in ("dcf", "wacc", "accretion", "merger", "pitch"))
    track = "PE" if is_pe and not is_ib else "IB" if is_ib else "Both"
    diagram_spec = f"flowchart LR\n  Q[{topic}] --> C[{slug}]\n  C --> A[Answer]"
    base = model or resolve_model_id(Tier.SMALL)
    proposal = EnrichmentProposal(
        canonical_question_id=question.id,
        track=track,
        topic=topic,
        subtopic=question.subtopic,
        concepts=[ConceptHint(slug=slug, title=topic.title() if topic else "General")],
        difficulty="medium",
        interview_stage_hints=["technical"],
        firm_soft_tags=[],
        mode_routing=ModeRouting(
            modes=[LearningMode.BOTH],
            company_prep_weight=0.5,
            concept_learn_weight=0.7 if not is_pe else 0.6,
        ),
        pe_relevance="core" if is_pe else None,
        ib_relevance="core" if is_ib else None,
        interview_ready_rewrite=None,
        diagram_drafts=[
            DiagramDraft(
                type=slug,
                format="mermaid",
                spec=diagram_spec,
                a11y_fallback=f"Concept flow for {topic}",
            )
        ],
        resource_drafts=[],
        confidence=0.35,
        model_version=f"{base}+heuristic",
        prompt_version=ENRICH_PROMPT_VERSION,
        metadata={
            "source_id": LLM_ENRICH_SOURCE_ID,
            "dry_run": True,
            "note": "Heuristic enrich; set OPENROUTER_API_KEY for Jev classification",
        },
    )
    label_enrichment_record(
        proposal.model_dump(mode="json"),
        model_version=proposal.model_version,
        prompt_version=ENRICH_PROMPT_VERSION,
    )
    return proposal
