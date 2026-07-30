"""Gemini client for offline enrichment (never on browse critical path).

Prefers Vercel AI Gateway when ``AI_GATEWAY_API_KEY`` / OIDC is available;
falls back to Google Generative Language API with ``GEMINI_API_KEY``.

Structured output mirrors AI SDK ``Output.object`` patterns used in
``packages/ai`` — Python worker uses REST until a shared gateway client lands.
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx

from ibpe_corpus.answers.enrich_models import (
    ConceptHint,
    DiagramDraft,
    EnrichmentProposal,
    FirmSoftTag,
    LearningMode,
    ModeRouting,
    ResourceDraft,
)
from ibpe_corpus.answers.provenance import label_enrichment_record
from ibpe_corpus.schemas.models import CanonicalQuestion

ENRICH_MODEL_DEFAULT = "google/gemini-2.5-flash"
ENRICH_PROMPT_VERSION = "enrich-v1"
GEMINI_ENRICH_SOURCE_ID = "gemini_enrichment_v1"

# Avoid importing this module via package __init__ when running as __main__.
__all__ = [
    "ENRICH_MODEL_DEFAULT",
    "ENRICH_PROMPT_VERSION",
    "GEMINI_ENRICH_SOURCE_ID",
    "GeminiEnrichClient",
    "credentials_configured",
    "resolve_model_id",
]

_SYSTEM = """You enrich IB/PE interview Q/A for a learning product.
Return ONLY valid JSON matching the schema. Rules:
- Never claim the content came from Glassdoor.
- Never claim the content came from a GitHub file unless that file literally contained it.
- Label all of your output as gemini_synthesised enrichment.
- Prefer concise taxonomy: track, topic, subtopic, concepts, firm soft-tags, mode routing.
"""


def credentials_configured() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("AI_GATEWAY_API_KEY"))


def resolve_model_id() -> str:
    return os.environ.get("IBPE_ENRICH_MODEL") or ENRICH_MODEL_DEFAULT


class GeminiEnrichClient:
    """Thin HTTP client; call only from worker/batch jobs."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float = 60.0,
        dry_run: bool = False,
    ) -> None:
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get(
            "AI_GATEWAY_API_KEY"
        )
        self.model = model or resolve_model_id()
        self.timeout = timeout
        self.dry_run = dry_run or not self.api_key

    def propose(self, question: CanonicalQuestion) -> EnrichmentProposal:
        if self.dry_run:
            return self._heuristic_proposal(question)

        payload = self._call_model(question)
        return self._parse_proposal(question, payload)

    def _call_model(self, question: CanonicalQuestion) -> dict[str, Any]:
        """Call AI Gateway if model id is provider/model, else Gemini API."""
        user = {
            "canonical_question_id": question.id,
            "wording": question.canonical_wording,
            "topic": question.topic,
            "subtopic": question.subtopic,
            "domain": question.domain.value if question.domain else None,
            "schema": {
                "track": "IB|PE|Both",
                "topic": "string",
                "subtopic": "string|null",
                "concepts": [{"slug": "str", "title": "str", "prerequisites": ["str"]}],
                "difficulty": "easy|medium|hard",
                "interview_stage_hints": ["str"],
                "firm_soft_tags": [
                    {"firm_id": "str", "firm_name": "str", "relevance": 0.0, "rationale": "str"}
                ],
                "mode_routing": {
                    "modes": ["company_prep", "concept_learn", "both"],
                    "company_prep_weight": 0.5,
                    "concept_learn_weight": 0.5,
                },
                "pe_relevance": "str|null",
                "ib_relevance": "str|null",
                "interview_ready_rewrite": "str|null",
                "diagram_drafts": [
                    {"type": "str", "format": "mermaid", "spec": "str", "a11y_fallback": "str"}
                ],
                "resource_drafts": [
                    {"label": "str", "url": "https://...", "kind": "external", "concept_ids": []}
                ],
                "confidence": 0.0,
            },
        }
        prompt = _SYSTEM + "\n\nINPUT:\n" + json.dumps(user)

        if "/" in self.model and os.environ.get("AI_GATEWAY_API_KEY"):
            return self._gateway_generate(prompt)
        return self._google_generate(prompt)

    def _gateway_generate(self, prompt: str) -> dict[str, Any]:
        # AI Gateway OpenAI-compatible chat completions.
        url = os.environ.get(
            "AI_GATEWAY_URL", "https://ai-gateway.vercel.sh/v1/chat/completions"
        )
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(url, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)

    def _google_generate(self, prompt: str) -> dict[str, Any]:
        # Strip provider prefix for Google API model ids.
        model = self.model.split("/", 1)[-1]
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent"
        )
        params = {"key": self.api_key}
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
            },
        }
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(url, params=params, json=body)
            resp.raise_for_status()
            data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)

    def _parse_proposal(
        self, question: CanonicalQuestion, payload: dict[str, Any]
    ) -> EnrichmentProposal:
        stamped = label_enrichment_record(
            payload,
            model_version=self.model,
            prompt_version=ENRICH_PROMPT_VERSION,
        )
        modes_raw = (stamped.get("mode_routing") or {}).get("modes") or ["both"]
        modes: list[LearningMode] = []
        for m in modes_raw:
            try:
                modes.append(LearningMode(m))
            except ValueError:
                modes.append(LearningMode.BOTH)
        routing = ModeRouting(
            modes=modes or [LearningMode.BOTH],
            company_prep_weight=float(
                (stamped.get("mode_routing") or {}).get("company_prep_weight", 0.5)
            ),
            concept_learn_weight=float(
                (stamped.get("mode_routing") or {}).get("concept_learn_weight", 0.5)
            ),
        )
        concepts = [
            ConceptHint(
                slug=c.get("slug") or "unknown",
                title=c.get("title"),
                prerequisites=list(c.get("prerequisites") or []),
            )
            for c in (stamped.get("concepts") or [])
            if isinstance(c, dict)
        ]
        firms = [
            FirmSoftTag(
                firm_id=f.get("firm_id") or "unknown",
                firm_name=f.get("firm_name"),
                relevance=float(f.get("relevance") or 0.5),
                rationale=f.get("rationale"),
            )
            for f in (stamped.get("firm_soft_tags") or [])
            if isinstance(f, dict)
        ]
        diagrams = [
            DiagramDraft(
                type=d.get("type") or "generic",
                format=d.get("format") or "mermaid",
                spec=d.get("spec") or "",
                a11y_fallback=d.get("a11y_fallback"),
            )
            for d in (stamped.get("diagram_drafts") or [])
            if isinstance(d, dict) and d.get("spec")
        ]
        resources = [
            ResourceDraft(
                label=r.get("label") or "Resource",
                url=r.get("url") or "https://example.com",
                kind=r.get("kind") or "external",
                concept_ids=list(r.get("concept_ids") or []),
                firm_ids=list(r.get("firm_ids") or []),
            )
            for r in (stamped.get("resource_drafts") or [])
            if isinstance(r, dict)
        ]
        return EnrichmentProposal(
            canonical_question_id=question.id,
            track=stamped.get("track"),
            topic=stamped.get("topic") or question.topic,
            subtopic=stamped.get("subtopic") or question.subtopic,
            concepts=concepts,
            difficulty=stamped.get("difficulty"),
            interview_stage_hints=list(stamped.get("interview_stage_hints") or []),
            firm_soft_tags=firms,
            mode_routing=routing,
            pe_relevance=stamped.get("pe_relevance"),
            ib_relevance=stamped.get("ib_relevance"),
            interview_ready_rewrite=stamped.get("interview_ready_rewrite"),
            diagram_drafts=diagrams,
            resource_drafts=resources,
            confidence=float(stamped.get("confidence") or 0.5),
            model_version=self.model,
            prompt_version=ENRICH_PROMPT_VERSION,
            metadata={"source_id": GEMINI_ENRICH_SOURCE_ID, "dry_run": False},
        )

    def _heuristic_proposal(self, question: CanonicalQuestion) -> EnrichmentProposal:
        """Offline / no-key skeleton: deterministic tags from wording."""
        blob = " ".join(
            filter(None, [question.canonical_wording, question.topic, question.subtopic])
        ).lower()
        topic = question.topic or "general"
        slug = topic.replace(" ", "-").lower() if topic else "general"
        is_pe = any(k in blob for k in ("lbo", "moic", "irr", "buyout", "sponsor"))
        is_ib = any(k in blob for k in ("dcf", "wacc", "accretion", "merger", "pitch"))
        track = "PE" if is_pe and not is_ib else "IB" if is_ib else "Both"
        modes = [LearningMode.BOTH]
        diagram_spec = (
            f"flowchart LR\n  Q[{topic}] --> C[{slug}]\n  C --> A[Answer]"
        )
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
                modes=modes,
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
            model_version=f"{self.model}+heuristic",
            prompt_version=ENRICH_PROMPT_VERSION,
            metadata={
                "source_id": GEMINI_ENRICH_SOURCE_ID,
                "dry_run": True,
                "note": "Heuristic enrich; set GEMINI_API_KEY for live model calls",
            },
        )
        label_enrichment_record(
            proposal.model_dump(mode="json"),
            model_version=proposal.model_version,
            prompt_version=ENRICH_PROMPT_VERSION,
        )
        return proposal
