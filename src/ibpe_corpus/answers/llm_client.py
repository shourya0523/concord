"""OpenRouter LLM client for offline enrichment (never on the browse path).

One gateway, two tiers (ADR 0007):

* ``small`` — ``LLM_SMALL_MODEL`` (default ``deepseek/deepseek-v4-flash``). The
  default for every enrichment job (taxonomy, rubric drafts, answer-expansion
  proposals, signal topic tags). Cost-optimised.
* ``primary`` — ``LLM_PRIMARY_MODEL`` ("Jev"; default placeholder
  ``deepseek/deepseek-v4.1-flash``). Used only when a caller asks for it
  (``--tier primary``) or to escalate a draft that failed validation once
  with the small model.

Every request goes to ``{OPENROUTER_BASE_URL}/chat/completions`` with a strict
``json_schema`` response format generated from a Pydantic model, a
``models`` fallback list (tier model, then ``LLM_FALLBACK_MODEL``) and
``usage.include`` so cost is reported. Replies are validated with Pydantic;
429 / 5xx / transport errors are retried with exponential backoff. The API key
is only ever placed in the ``Authorization`` header — never logged, never in
``repr`` or exception messages.

"Only when required": callers run their heuristic first and call the model
only when the heuristic result fails validation or is below the auto-approve
bar (:func:`run_tiered` + :class:`LlmRouteCounts` record which path won).
"""

from __future__ import annotations

import json
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
    FirmSoftTag,
    LearningMode,
    ModeRouting,
    ResourceDraft,
)
from ibpe_corpus.answers.provenance import label_enrichment_record
from ibpe_corpus.schemas.models import CanonicalQuestion

log = logging.getLogger(__name__)

OPENROUTER_BASE_URL_DEFAULT = "https://openrouter.ai/api/v1"
SMALL_MODEL_DEFAULT = "deepseek/deepseek-v4-flash"
# "Jev" is not in the OpenRouter catalogue yet — the id is an env setting.
PRIMARY_MODEL_DEFAULT = "deepseek/deepseek-v4.1-flash"
FALLBACK_MODEL_DEFAULT = "google/gemini-2.5-flash-lite"
APP_TITLE = "Concord"

ENRICH_PROMPT_VERSION = "enrich-v1"
LLM_ENRICH_SOURCE_ID = "openrouter_enrichment_v1"

__all__ = [
    "APP_TITLE",
    "ENRICH_PROMPT_VERSION",
    "EnrichClient",
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
    "PRIMARY_MODEL_DEFAULT",
    "SMALL_MODEL_DEFAULT",
    "Tier",
    "credentials_configured",
    "heuristic_proposal",
    "resolve_model_id",
    "run_tiered",
    "strict_json_schema",
    "validate_enrich_draft",
]

T = TypeVar("T", bound=BaseModel)


class Tier(str, Enum):
    SMALL = "small"
    PRIMARY = "primary"


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

    The only error that triggers small → primary escalation.
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


def _coerce_tier(tier: Tier | str | None, default: Tier = Tier.SMALL) -> Tier:
    if tier is None or tier == "":
        return default
    return tier if isinstance(tier, Tier) else Tier(str(tier).strip().lower())


def resolve_model_id(tier: Tier | str | None = None) -> str:
    """Model id for ``tier`` from env (``LLM_SMALL_MODEL`` / ``LLM_PRIMARY_MODEL``)."""
    t = _coerce_tier(tier)
    if t is Tier.PRIMARY:
        return (os.environ.get("LLM_PRIMARY_MODEL") or "").strip() or PRIMARY_MODEL_DEFAULT
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


@dataclass
class LlmRouteCounts:
    """Which path produced each enrichment item (reported per job)."""

    heuristic: int = 0
    small: int = 0
    primary: int = 0
    failed: int = 0

    def record(self, route: str | Tier) -> None:
        key = route.value if isinstance(route, Tier) else str(route)
        if key not in {"heuristic", "small", "primary", "failed"}:
            raise ValueError(f"unknown LLM route {route!r}")
        setattr(self, key, getattr(self, key) + 1)

    def merge(self, other: "LlmRouteCounts") -> "LlmRouteCounts":
        return LlmRouteCounts(
            heuristic=self.heuristic + other.heuristic,
            small=self.small + other.small,
            primary=self.primary + other.primary,
            failed=self.failed + other.failed,
        )

    @property
    def llm_calls_attempted(self) -> int:
        return self.small + self.primary + self.failed

    def as_dict(self) -> dict[str, int]:
        return {
            "heuristic": self.heuristic,
            "small": self.small,
            "primary": self.primary,
            "failed": self.failed,
        }


Step = tuple[Any, Callable[[], Any]]


def run_tiered(steps: Sequence[Step]) -> tuple[Any, str]:
    """Run model steps in order; escalate only on validation failure.

    Each step is ``(tier, fn)``. ``fn`` returns the validated value, ``None``
    (output unusable → validation failure) or raises
    :class:`LlmValidationError` (same). Any other exception is a hard failure
    (network, auth, rate limit after retries) and stops escalation. Returns
    ``(value, route)`` with route ``small`` / ``primary`` / ``failed``.
    """
    for tier, fn in steps:
        try:
            value = fn()
        except LlmValidationError as exc:
            log.info("llm %s draft failed validation: %s", _coerce_tier(tier).value, exc.errors[:3])
            continue
        except Exception as exc:  # noqa: BLE001 — hard failure → heuristic
            log.warning("llm %s call failed: %s", _coerce_tier(tier).value, type(exc).__name__)
            return None, "failed"
        if value is not None:
            return value, _coerce_tier(tier).value
    return None, "failed"


# --------------------------------------------------------------------------- #
# HTTP client                                                                 #
# --------------------------------------------------------------------------- #

_UNSET: Any = object()
_RETRY_STATUSES = {408, 409, 425, 429, 500, 502, 503, 504, 520, 522, 524, 529}


class OpenRouterClient:
    """OpenRouter chat-completions client with tiers, fallback and retries."""

    supports_tiers = True

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        small_model: str | None = None,
        primary_model: str | None = None,
        fallback_model: str | None = _UNSET,
        default_tier: Tier | str | None = None,
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
        self.primary_model = primary_model or resolve_model_id(Tier.PRIMARY)
        self.fallback_model = _fallback_from_env() if fallback_model is _UNSET else fallback_model
        self.default_tier = _coerce_tier(default_tier or os.environ.get("LLM_DEFAULT_TIER"))
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
            f"primary={self.primary_model!r}, tier={self.default_tier.value!r}, dry_run={self.dry_run})"
        )

    @property
    def model(self) -> str:
        """Configured model for the default tier (reports / legacy callers)."""
        return self.model_for(self.default_tier)

    def model_for(self, tier: Tier | str | None = None) -> str:
        t = _coerce_tier(tier, self.default_tier)
        return self.primary_model if t is Tier.PRIMARY else self.small_model

    def models_for(self, tier: Tier | str | None = None) -> list[str]:
        primary = self.model_for(tier)
        out = [primary]
        if self.fallback_model and self.fallback_model != primary:
            out.append(self.fallback_model)
        return out

    def tier_plan(self, tier: Tier | str | None = None) -> list[Tier]:
        """Tiers to try in order: the requested tier, then primary on escalation."""
        t = _coerce_tier(tier, self.default_tier)
        plan = [t]
        if (
            t is Tier.SMALL
            and self.escalate
            and self.primary_model
            and self.primary_model != self.small_model
        ):
            plan.append(Tier.PRIMARY)
        return plan

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
        tier: Tier | str | None = None,
        system: str | None = None,
        temperature: float | None = None,
    ) -> dict[str, Any]:
        models = self.models_for(tier)
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
        tier: Tier | str | None = None,
        system: str | None = None,
        temperature: float | None = None,
    ) -> LlmResult[T]:
        """One structured completion, validated against ``schema``."""
        t = _coerce_tier(tier, self.default_tier)
        body = self.build_body(prompt, schema, tier=t, system=system, temperature=temperature)
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
        log.debug("openrouter ok tier=%s model=%s", t.value, served)
        return LlmResult(
            value=value,
            model=served,
            tier=t,
            requested_model=requested,
            usage=usage,
            response_id=data.get("id"),
        )

    def json_caller(self, schema: type[BaseModel], *, tier: Tier | str | None = None) -> "JsonCaller":
        return JsonCaller(self, schema, _coerce_tier(tier, self.default_tier))


class JsonCaller:
    """``prompt -> dict`` adapter for prompt modules (rubric-v1, signal-topic-v1).

    Keeps the plain-callable interface those modules accept while exposing
    ``tier`` and the model OpenRouter actually served (``last_model``).
    """

    def __init__(self, client: OpenRouterClient, schema: type[BaseModel], tier: Tier) -> None:
        self.client = client
        self.schema = schema
        self.tier = tier
        self.last_model: str | None = None

    @property
    def model(self) -> str:
        return self.client.model_for(self.tier)

    def __call__(self, prompt: str) -> dict[str, Any]:
        result = self.client.complete(prompt, self.schema, tier=self.tier)
        self.last_model = result.model
        return result.value.model_dump(mode="json")


# --------------------------------------------------------------------------- #
# enrich-v1                                                                   #
# --------------------------------------------------------------------------- #

_SYSTEM = """You enrich IB/PE interview Q/A for a learning product.
Return ONLY JSON matching the supplied schema. Rules:
- Never claim the content came from Glassdoor.
- Never claim the content came from a GitHub file unless that file literally contained it.
- Your output is stored as model-synthesised enrichment, never as a source answer.
- topic MUST be one of the allowed topic slugs; track is IB, PE or Both.
- Prefer concise taxonomy: track, topic, subtopic, concepts, firm soft-tags, mode routing.
- confidence is your calibrated probability (0-1) that topic and track are correct.
"""

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


def _enrich_prompt(question: CanonicalQuestion) -> str:
    from ibpe_corpus.canonical.taxonomy_rules import TOPIC_SLUGS

    payload = {
        "canonical_question_id": question.id,
        "wording": question.canonical_wording,
        "topic": question.topic,
        "subtopic": question.subtopic,
        "domain": question.domain.value if question.domain else None,
        "allowed_topics": list(TOPIC_SLUGS),
    }
    return "INPUT:\n" + json.dumps(payload)


def _proposal_from_draft(
    question: CanonicalQuestion,
    draft: EnrichDraft,
    *,
    model: str,
    tier: Tier,
) -> EnrichmentProposal:
    stamped = label_enrichment_record(
        draft.model_dump(mode="json"),
        model_version=model,
        prompt_version=ENRICH_PROMPT_VERSION,
    )
    return EnrichmentProposal(
        canonical_question_id=question.id,
        track=draft.track,
        topic=draft.topic or question.topic,
        subtopic=draft.subtopic or question.subtopic,
        concepts=[ConceptHint.model_validate(c.model_dump()) for c in draft.concepts],
        difficulty=draft.difficulty,
        interview_stage_hints=list(draft.interview_stage_hints),
        firm_soft_tags=[FirmSoftTag.model_validate(f.model_dump()) for f in draft.firm_soft_tags],
        mode_routing=ModeRouting.model_validate(draft.mode_routing.model_dump()),
        pe_relevance=draft.pe_relevance,
        ib_relevance=draft.ib_relevance,
        interview_ready_rewrite=draft.interview_ready_rewrite,
        diagram_drafts=[
            DiagramDraft(type=d.type or "generic", format="mermaid", spec=d.spec,
                         a11y_fallback=d.a11y_fallback)
            for d in draft.diagram_drafts
            if d.spec
        ],
        resource_drafts=[
            ResourceDraft(label=r.label, url=r.url, kind=r.kind, concept_ids=list(r.concept_ids))
            for r in draft.resource_drafts
        ],
        confidence=draft.confidence,
        model_version=model,
        prompt_version=ENRICH_PROMPT_VERSION,
        metadata={
            "source_id": LLM_ENRICH_SOURCE_ID,
            "dry_run": False,
            "tier": tier.value,
            "gateway": "openrouter",
            "provenance_label": stamped["provenance"],
        },
    )


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
            "note": "Heuristic enrich; set OPENROUTER_API_KEY for live model calls",
        },
    )
    label_enrichment_record(
        proposal.model_dump(mode="json"),
        model_version=proposal.model_version,
        prompt_version=ENRICH_PROMPT_VERSION,
    )
    return proposal


class EnrichClient(OpenRouterClient):
    """enrich-v1 proposals over OpenRouter (heuristic skeleton in dry-run)."""

    def propose(
        self, question: CanonicalQuestion, *, tier: Tier | str | None = None
    ) -> EnrichmentProposal:
        """One enrich-v1 proposal at ``tier``.

        Raises :class:`LlmValidationError` when the reply fails the schema or
        :func:`validate_enrich_draft` — callers escalate via :func:`run_tiered`.
        """
        if self.dry_run:
            return heuristic_proposal(question, model=self.model)
        t = _coerce_tier(tier, self.default_tier)
        result = self.complete(_enrich_prompt(question), EnrichDraft, tier=t, system=_SYSTEM)
        errors = validate_enrich_draft(result.value)
        if errors:
            raise LlmValidationError("enrich-v1 draft failed validation", errors=errors,
                                     model=result.model)
        return _proposal_from_draft(question, result.value, model=result.model, tier=t)

    def propose_routed(
        self, question: CanonicalQuestion, *, tier: Tier | str | None = None
    ) -> tuple[EnrichmentProposal | None, str]:
        """Proposal via the tier plan (small → primary on validation failure)."""
        steps = [(t, (lambda t=t: self.propose(question, tier=t))) for t in self.tier_plan(tier)]
        return run_tiered(steps)
