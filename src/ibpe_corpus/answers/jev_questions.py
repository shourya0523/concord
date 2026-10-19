"""Jev question catalogue: the typed questions Concord asks the decision model.

One place for every label set Jev chooses from, so the labels stay identical
to the deterministic rules they are compared against:

* topic — the migration 038 / keyword-rules slugs (``TOPIC_SLUGS``), one short
  description each;
* domain — ``ib | pe | both | other`` (``schemas.models.Domain``);
* difficulty — ordered ``easy < medium < hard`` (``score``);
* PE strategy — ``config/private_equity_taxonomy.yml`` ``strategy_roles`` ids
  (+ ``general``);
* concepts — curriculum concept ids seeded by migration 060;
* learning mode — ``company_prep | concept_learn | both`` (``LearningMode``);
* verification — the cookbook ``supported | unsupported | declined`` choice for
  small-model drafts (rubrics, expansion appendices, diagrams).

Questions in one request are answered independently, so every builder here
returns a ``{key: question}`` map for ONE request per item.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Mapping

from ibpe_corpus.answers.decisions_client import ChoiceQuestion, ScoreQuestion
from ibpe_corpus.canonical.taxonomy_rules import TOPIC_SLUGS

TAXONOMY_JEV_PROMPT_VERSION = "taxonomy-jev-v1"
STATE_TEXT_LIMIT = 1500  # chars of source answer sent as state (input tokens are the cost)

TOPIC_CRITERIA: dict[str, str] = {
    "lbo": "Leveraged buyouts: LBO mechanics, paper LBOs, sources and uses, debt paydown, entry/exit multiples, sponsor deals.",
    "valuation": "Valuation methods: DCF, WACC, CAPM, comparable companies, precedent transactions, multiples, terminal value, free cash flow.",
    "enterprise_value": "Enterprise value vs equity value: the EV bridge, net debt, minority interest, preferred stock, diluted share count.",
    "working_capital": "Working capital: receivables, payables, inventory, cash conversion cycle, NWC changes.",
    "accounting": "Accounting and the three financial statements: how items flow, depreciation, deferred taxes, goodwill, revenue recognition.",
    "merger_models": "M&A and merger models: accretion/dilution, synergies, purchase price, stock vs cash deals, deal process and buyers.",
    "credit": "Credit and debt: credit analysis, covenants, leverage and coverage ratios, bonds, high yield, private credit, lenders.",
    "capital_structure": "Capital structure and financing: debt vs equity, cost of capital, IPOs and ECM, buybacks, dividend policy.",
    "investment_thesis": "Investment theses and pitches: stock pitches, why invest in a company or deal, moats, deal evaluation.",
    "due_diligence": "Due diligence: quality of earnings, commercial diligence, data rooms, CIMs, customer calls.",
    "restructuring": "Restructuring and distress: bankruptcy, Chapter 11, liquidation, creditor recoveries, liability management.",
    "returns": "Returns and fund economics: IRR, MOIC, cash-on-cash, hurdle rates, carry, fees, LPs and GPs.",
    "value_creation": "Value creation and portfolio operations: operational improvements, add-on acquisitions, margin expansion, KPIs, 100-day plans.",
    "industry_coverage": "Industry and sector analysis: coverage groups, market structure, competition, sector trends.",
    "markets": "Markets and macro: current market conditions, interest rates, inflation, the Fed, recent market news.",
    "brainteasers": "Brainteasers, mental math, probability puzzles and market-sizing questions.",
    "behavioral": "Behavioural and fit: tell me about yourself, why this firm or role, strengths and weaknesses, teamwork, STAR stories.",
}
assert tuple(TOPIC_CRITERIA) == TOPIC_SLUGS, "Jev topic labels must match the 038 rule slugs"

DOMAIN_CRITERIA: dict[str, str] = {
    "ib": "Investment banking interview content (M&A advisory, capital markets, coverage, valuation for deals).",
    "pe": "Private equity interview content (buyouts, sponsor returns, portfolio operations, fund economics).",
    "both": "Asked equally in investment banking and private equity interviews (e.g. core accounting, fit questions).",
    "other": "Not an investment banking or private equity interview question.",
}

DIFFICULTY_LEVELS: tuple[str, ...] = ("easy", "medium", "hard")
DIFFICULTY_CRITERIA: list[str] = [
    "Easy: a definition or single concept a first-round candidate should answer from memory.",
    "Medium: a standard technical walk-through or explanation linking a few concepts.",
    "Hard: multi-step reasoning, edge cases, second-order effects or advanced mechanics.",
]

MODE_CRITERIA: dict[str, str] = {
    "company_prep": "Mainly useful to prepare for a specific firm's interview (firm, deal or fit specific).",
    "concept_learn": "Mainly useful to learn a technical concept, independent of any firm.",
    "both": "Useful both for firm-specific interview prep and for learning the underlying concept.",
}

# Migration 060_curriculum_lessons.sql (canonical.concepts): id → (slug, summary, prerequisite ids).
CONCEPT_CATALOG: dict[str, tuple[str, str, tuple[str, ...]]] = {
    "concept_accounting_foundations": (
        "accounting-foundations",
        "Three statements, accruals, working capital, and common interview adjustments.",
        (),
    ),
    "concept_ev_equity_value": (
        "ev-equity-value",
        "Bridge market value, net debt, minority interest, associates, and diluted shares.",
        ("concept_accounting_foundations",),
    ),
    "concept_valuation_comps": (
        "valuation-comps",
        "Relative valuation: peer selection, multiples, control premiums, and the football field.",
        ("concept_ev_equity_value",),
    ),
    "concept_dcf_wacc": (
        "dcf-wacc",
        "Forecast free cash flow, terminal value, discount rates, sensitivities, and the DDM for banks.",
        ("concept_accounting_foundations", "concept_ev_equity_value"),
    ),
    "concept_lbo_paper_lbo": (
        "lbo-paper-lbo",
        "Sources and uses, debt schedule, cash sweep, exit multiple, and returns math.",
        ("concept_dcf_wacc",),
    ),
    "concept_merger_model": (
        "merger-model",
        "Purchase price, funding mix, goodwill, synergies, and accretion / dilution.",
        ("concept_accounting_foundations", "concept_ev_equity_value"),
    ),
    "concept_pe_fund_mechanics": (
        "pe-fund-mechanics",
        "LPs and GPs, fees and carry, the distribution waterfall, returns metrics, and diligence.",
        ("concept_lbo_paper_lbo",),
    ),
    "concept_behavioural_story": (
        "behavioural-story",
        "Personal story, motivation, STAR stories, and fit answers.",
        (),
    ),
}
NO_CONCEPT = "none"


def concept_criteria() -> dict[str, str]:
    out = {cid: summary for cid, (_slug, summary, _pre) in CONCEPT_CATALOG.items()}
    out[NO_CONCEPT] = "None of the listed curriculum concepts is what this question tests."
    return out


@lru_cache(maxsize=1)
def pe_strategy_criteria() -> dict[str, str]:
    """``strategy_roles`` from the PE taxonomy config (+ ``general``)."""
    out: dict[str, str] = {}
    try:
        from ibpe_corpus.pe.taxonomy import load_taxonomy

        for role in load_taxonomy().get("strategy_roles", []) or []:
            sid = str(role.get("id") or "").strip()
            if not sid:
                continue
            aliases = ", ".join(str(a) for a in (role.get("aliases") or [])[:3])
            label = str(role.get("label") or sid)
            out[sid] = f"{label} strategy ({aliases})." if aliases else f"{label} strategy."
    except Exception:  # noqa: BLE001 — config missing → only "general"
        out = {}
    out["general"] = "Not specific to one private equity strategy."
    return out


def rule_pe_strategy(text: str) -> str | None:
    """First strategy whose alias appears in ``text`` (the keyword rule for agreement)."""
    import re

    try:
        from ibpe_corpus.pe.taxonomy import load_taxonomy

        roles = load_taxonomy().get("strategy_roles", []) or []
    except Exception:  # noqa: BLE001
        return None
    blob = text or ""
    for role in roles:
        for alias in role.get("aliases") or []:
            if re.search(rf"\b{re.escape(str(alias))}\b", blob, re.IGNORECASE):
                return str(role.get("id"))
    return None


# --------------------------------------------------------------------------- #
# Builders                                                                    #
# --------------------------------------------------------------------------- #


def _clip(text: str | None, limit: int = STATE_TEXT_LIMIT) -> str | None:
    if not text:
        return None
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def question_state(
    wording: str,
    *,
    source_category: str | None = None,
    source_track: str | None = None,
    source_answer: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    """Compact ``state`` for one teaching question (only non-empty fields)."""
    state: dict[str, Any] = {
        "interview_question": wording,
        "source_category": source_category,
        "source_track": source_track,
        "source_answer": _clip(source_answer),
        **extra,
    }
    return {k: v for k, v in state.items() if v not in (None, "", [], {})}


def taxonomy_questions(fields: set[str] | frozenset[str]) -> dict[str, ChoiceQuestion | ScoreQuestion]:
    """Questions for the requested taxonomy ``fields`` (topic/domain/difficulty/pe_strategy)."""
    qs: dict[str, ChoiceQuestion | ScoreQuestion] = {}
    if "topic" in fields:
        qs["topic"] = ChoiceQuestion(
            instructions="Which interview topic does interview_question test? Use source_answer only as context.",
            criteria=dict(TOPIC_CRITERIA),
        )
    if "domain" in fields:
        qs["domain"] = ChoiceQuestion(
            instructions="Which interview track is interview_question asked in?",
            criteria=dict(DOMAIN_CRITERIA),
        )
    if "difficulty" in fields:
        qs["difficulty"] = ScoreQuestion(
            instructions="How difficult is interview_question for an entry-level IB / PE candidate?",
            criteria=list(DIFFICULTY_CRITERIA),
        )
    if "pe_strategy" in fields:
        qs["pe_strategy"] = ChoiceQuestion(
            instructions="Which private equity strategy is interview_question specific to, if any?",
            criteria=pe_strategy_criteria(),
        )
    return qs


def graph_questions(*, include_topic: bool = True) -> dict[str, ChoiceQuestion | ScoreQuestion]:
    """``llm_enrich`` graph job: concept, learning mode, track, difficulty (+ topic)."""
    fields = {"domain", "difficulty"} | ({"topic"} if include_topic else set())
    qs = taxonomy_questions(fields)
    qs["concept"] = ChoiceQuestion(
        instructions="Which curriculum concept does interview_question primarily test?",
        criteria=concept_criteria(),
    )
    qs["mode"] = ChoiceQuestion(
        instructions="Which learning mode should interview_question be routed to?",
        criteria=dict(MODE_CRITERIA),
    )
    return qs


def signal_topic_questions(keys: list[str]) -> dict[str, ChoiceQuestion]:
    """One topic ``choice`` per signal text in ``state.signals[key]`` (one request per batch)."""
    return {
        key: ChoiceQuestion(
            instructions=f"Which interview topic does the question in signals.{key} test?",
            criteria=dict(TOPIC_CRITERIA),
        )
        for key in keys
    }


# --------------------------------------------------------------------------- #
# Draft verification (cookbook: Jev-verified cascade)                         #
# --------------------------------------------------------------------------- #

RUBRIC_VERIFY: Mapping[str, Any] = {
    "instructions": (
        "Compare draft (a grading rubric: key points, red flags, follow-ups) against "
        "source_teaching_answer. Which one describes it?"
    ),
    "criteria": {
        "supported": "Every key point and expected value in the draft is stated in source_teaching_answer, "
        "and the rubric grades answers to interview_question.",
        "unsupported": "The draft states at least one fact, number or requirement that source_teaching_answer "
        "does not contain or contradicts, or it grades a different question.",
        "declined": "The draft says source_teaching_answer is insufficient and adds no key points of its own.",
    },
}

EXPANSION_VERIFY: Mapping[str, Any] = {
    "instructions": (
        "Compare draft (an explanatory appendix) against source_teaching_answer. Which one describes it?"
    ),
    "criteria": {
        "supported": "The draft explains the reasoning behind source_teaching_answer for interview_question, "
        "is consistent with it, and asserts no firm-specific facts, numbers or policies absent from it.",
        "unsupported": "The draft contradicts source_teaching_answer, asserts facts or numbers it does not "
        "support, or answers a different question than interview_question.",
        "declined": "The draft says it cannot explain the answer and asserts no facts of its own.",
    },
}

DIAGRAM_VERIFY: Mapping[str, Any] = {
    "instructions": (
        "Compare draft (a Mermaid concept diagram) against interview_question and "
        "source_teaching_answer. Which one describes it?"
    ),
    "criteria": {
        "supported": "Every node and edge in the draft depicts a step or relationship stated in "
        "source_teaching_answer (or implied by interview_question) and nothing else.",
        "unsupported": "The draft shows a step, relationship or number that is not stated or is contradicted, "
        "or it depicts a different concept.",
        "declined": "The draft is empty or says the concept cannot be diagrammed.",
    },
}
