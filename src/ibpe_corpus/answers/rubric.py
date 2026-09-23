"""Answer rubrics (plan P2.3): the grading contract attached to each answer.

Output matches ``AnswerRubricSchema`` in ``packages/contracts/src/learning-loop.ts``
(version ``rubric-v1``). Two producers:

* **Heuristic** (default, no LLM): split the teaching answer into 2–6 key
  claims (verbatim sentences), weight them, mark the core definitional claim
  ``must_have``, derive grader cues, reuse the answer's mistakes / follow-ups
  (topic defaults otherwise) and turn ``calculation_representation`` into
  numeric checks recomputed with ``calculators.py``. Behavioural questions get
  a STAR (or motivation) template with ``kind="star"``.
* **LLM** (prompt ``rubric-v1``) when a Gemini / AI Gateway key exists; the
  model call is injectable so tests never hit the network.

Every rubric runs through :func:`validate_rubric` (weights sum to 1 ± 0.01,
≥ 1 must-have, ≤ 6 key points, numeric checks recompute). A heuristic rubric
is auto-approved (``review_status="approved"``, ``provenance="heuristic"``)
only when validators pass — it is extractive, not human-reviewed. LLM rubrics
are approved only when validators pass *and* every key point is grounded in
the teaching answer; otherwise the heuristic rubric is used.

ADR 0002: rubrics derive from teaching answers only — Glassdoor text never
becomes a key point, red flag or expected value.
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable, Sequence

from ibpe_corpus.answers.calculators import CALCULATOR_IDS, CalculatorError, run_topic
from ibpe_corpus.answers.generate import route_topic
from ibpe_corpus.canonical.taxonomy_rules import infer_topic
from ibpe_corpus.schemas.models import (
    RUBRIC_VERSION,
    Answer,
    AnswerRubric,
    CanonicalQuestion,
    RubricKeyPoint,
    RubricNumericCheck,
    utcnow,
)

RUBRIC_PROMPT_VERSION = "rubric-v1"
HEURISTIC_MODEL = "heuristic-rubric-v1"
MAX_KEY_POINTS = 6
MIN_CLAIM_CHARS = 25
WEIGHT_TOLERANCE = 0.01

LlmCall = Callable[[str], dict[str, Any]]

_SENTENCE_RE = re.compile(r"(?:(?<=[.!?])|(?<=[.!?]\)))\s+(?=[A-Z0-9$(\"“'])")
_NUMBER_RE = re.compile(r"(?:\$\s?)?\d+(?:[.,]\d+)?\s?(?:%|x\b|bn\b|mm\b|m\b)?", re.IGNORECASE)

_GLOSSARY: tuple[str, ...] = (
    "income statement", "balance sheet", "cash flow statement", "net income", "retained earnings",
    "operating income", "cash from operations", "shareholders' equity", "working capital",
    "enterprise value", "equity value", "net debt", "diluted shares", "treasury stock method",
    "non-controlling interest", "minority interest", "preferred stock", "cost of equity",
    "cost of debt", "weighted average cost of capital", "terminal value", "free cash flow",
    "discount rate", "discounted", "present value", "perpetuity growth", "exit multiple",
    "gordon growth", "comparable companies", "precedent transactions", "control premium",
    "accretion", "dilution", "accretive", "dilutive", "synergies", "purchase price", "goodwill",
    "deferred tax", "depreciation", "amortization", "capital expenditures", "capex", "ebitda",
    "ebit", "revenue", "margin", "leverage", "interest", "covenant", "seniority", "secured",
    "unsecured", "maturity", "refinancing", "default", "liquidity", "coverage", "irr", "moic",
    "multiple", "debt paydown", "sponsor", "equity contribution", "dividend", "recapitalization",
    "valuation", "dcf", "wacc", "beta", "capm", "risk-free rate", "equity risk premium", "tax",
    "tax shield", "pp&e", "inventory", "receivables", "payables", "deferred revenue", "impairment",
    "write-down", "stock purchase", "asset purchase", "step-up", "due diligence", "value creation",
    "carried interest", "management fee", "waterfall", "hurdle", "limited partners", "restructuring",
    "bankruptcy", "creditors", "recovery", "liquidation", "chapter 11", "ipo", "bookbuilding",
    "greenshoe", "convertible", "high-yield", "term loan", "revolver", "pik", "customer",
    "growth", "market share", "pricing", "cost", "cash", "debt", "equity", "shares", "eps",
)
_STOPWORDS = frozenset(
    "the a an and or of to in on for with by from at as is are was were be been being this that "
    "these those it its it's their there then than which who whom what when where why how into "
    "about over under more most less least very can could would should will may might must also "
    "such each other any all both some many much your you they them we our us i me my he she his "
    "her not no yes do does did done have has had so if but because while after before between "
    "during through up down out off again further once only own same just like get gets getting "
    "use used using make makes made one two three".split()
)

_TOPIC_FOLLOW_UPS: dict[str, list[str]] = {
    "accounting": [
        "Walk me through how a $10 increase in depreciation flows through the three statements.",
        "How would your answer change if the expense were not tax-deductible?",
    ],
    "valuation": [
        "Which valuation method would you weight most heavily here, and why?",
        "How would a 1% higher discount rate change the result?",
    ],
    "enterprise_value": [
        "What other items would you add or subtract in the bridge?",
        "How do operating leases affect enterprise value?",
    ],
    "working_capital": [
        "How does an increase in working capital affect free cash flow?",
        "What does negative working capital tell you about the business model?",
    ],
    "merger_models": [
        "Would the deal be accretive with 100% stock consideration instead?",
        "Why can an accretive deal still destroy value?",
    ],
    "lbo": [
        "Which levers drive returns in this LBO, and which matters most?",
        "How does more leverage change IRR and risk?",
    ],
    "returns": [
        "Why might a sponsor accept a lower IRR for a higher MOIC?",
        "How do interim dividends change MOIC versus IRR?",
    ],
    "credit": [
        "What covenants would you expect in this financing?",
        "How would lenders assess downside protection?",
    ],
    "capital_structure": [
        "How would you choose between debt and equity financing here?",
        "What happens to WACC as leverage increases?",
    ],
    "restructuring": [
        "Which class of claims is the fulcrum security, and why?",
        "Why might creditors prefer an out-of-court restructuring?",
    ],
    "value_creation": [
        "How would you prioritise these initiatives in the first 100 days?",
        "Which KPIs would you track to prove the value-creation plan is working?",
    ],
    "due_diligence": [
        "What would be the biggest red flag in this diligence?",
        "How would the findings change your valuation or structure?",
    ],
    "investment_thesis": [
        "What are the key risks to this thesis, and how would you mitigate them?",
        "What would make you walk away from the deal?",
    ],
    "industry_coverage": [
        "Which players are best positioned in this industry, and why?",
        "How would you size the addressable market?",
    ],
    "markets": [
        "How would this affect valuations and deal activity?",
        "What indicators would you watch next?",
    ],
    "brainteasers": [
        "How would you sanity-check your answer?",
        "What assumption drives the result most?",
    ],
    "behavioral": [
        "What would you do differently next time?",
        "What did you learn that applies to this role?",
    ],
}
_DEFAULT_FOLLOW_UPS = [
    "Can you give a concrete numerical example?",
    "What is the most common mistake people make on this question?",
]

_TOPIC_RED_FLAGS: dict[str, list[str]] = {
    "accounting": ["Leaves the balance sheet unbalanced", "Ignores the tax effect"],
    "valuation": ["Mixes enterprise-value and equity-value metrics", "Terminal growth above the discount rate"],
    "enterprise_value": ["Subtracts debt instead of adding it", "Uses basic instead of diluted shares"],
    "working_capital": ["Gets the cash-flow sign of a working-capital increase wrong"],
    "merger_models": ["Equates EPS accretion with value creation", "Ignores new shares issued"],
    "lbo": ["Quotes enterprise-value returns instead of equity returns"],
    "returns": ["Treats MOIC as an annual return"],
    "credit": ["Confuses maintenance and incurrence covenants"],
    "restructuring": ["Uses book equity instead of recovery values"],
}
_DEFAULT_RED_FLAGS = ["States conclusions without explaining the mechanics"]

_STAR_RED_FLAGS = [
    "Blames others or shows no ownership",
    "No concrete result or outcome",
    "Generic answer with no specific example",
    "Rambles without a clear structure",
]
_MOTIVATION_RED_FLAGS = [
    "Reasons are generic and would apply to any firm or role",
    "Motivation centres on money, prestige or exit opportunities alone",
    "No evidence from the candidate's own experience",
]

_MOTIVATION_RE = re.compile(
    r"\bwhy\b|tell me about yourself|walk me through your (resume|cv|background)|career|long.term|"
    r"future|plans?\b|where else|interviewing|first choice|\bgoal",
    re.IGNORECASE,
)
_PURE_CALC_RE = re.compile(
    r"^\s*(calculate|compute|what (is|are|would be) the (resulting|implied|new)|how much (is|will|would))\b",
    re.IGNORECASE,
)
_UNIT_RATE_KEYS =("wacc", "irr", "eps_delta", "rate", "yield", "growth", "margin")
_UNIT_MULTIPLE_KEYS = ("moic", "leverage", "coverage", "multiple")


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #


def _norm(text: str) -> str:
    return " ".join((text or "").split())


def _sentences(text: str) -> list[str]:
    body = _norm(text)
    if not body:
        return []
    return [s.strip() for s in _SENTENCE_RE.split(body) if s.strip()]


def teaching_text(answer: Answer) -> str:
    """Concise + expanded without duplicating sentences."""
    concise = _norm(answer.concise_answer)
    expanded = _norm(answer.expanded_explanation)
    if not expanded or expanded == concise:
        return concise
    if concise and concise in expanded:
        return expanded
    return f"{concise} {expanded}".strip()


def _claims(answer: Answer) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for sent in _sentences(teaching_text(answer)):
        key = sent.lower()
        if key in seen or sent.endswith("?") or len(sent) < MIN_CLAIM_CHARS:
            continue
        seen.add(key)
        out.append(sent)
    if len(out) < 2:
        # Split a single long claim on clause boundaries (still verbatim).
        pieces: list[str] = []
        for sent in out or [_norm(answer.concise_answer)]:
            for part in re.split(r";\s+|:\s+(?=[A-Z])|\s+—\s+", sent):
                if len(part.strip()) >= MIN_CLAIM_CHARS:
                    pieces.append(part.strip())
        if len(pieces) >= 2:
            out = pieces
    return out


def _claim_score(claim: str, idx: int, concise: str) -> float:
    low = claim.lower()
    terms = len(_glossary_hits(claim))
    score = min(terms, 6) * 1.0
    if claim in concise:
        score += 2.0
    if _NUMBER_RE.search(claim):
        score += 0.5
    score -= idx * 0.15
    if low.startswith(("worked example", "for example", "e.g.")):
        score -= 0.5
    return score


def _select_claims(claims: list[str], concise: str) -> list[str]:
    if len(claims) <= MAX_KEY_POINTS:
        return claims
    first = claims[0]
    ranked = sorted(
        range(1, len(claims)),
        key=lambda i: -_claim_score(claims[i], i, concise),
    )[: MAX_KEY_POINTS - 1]
    keep = sorted([0, *ranked])
    return [first] + [claims[i] for i in keep if i != 0]


_GLOSSARY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (term, re.compile(rf"(?<![a-z]){re.escape(term)}(?![a-z])"))
    for term in sorted(_GLOSSARY, key=len, reverse=True)
]


def _glossary_hits(text: str) -> list[str]:
    low = text.lower()
    return [term for term, pat in _GLOSSARY_PATTERNS if pat.search(low)]


def derive_cues(text: str, *, limit: int = 5) -> list[str]:
    """Grader cue phrases: glossary terms, numbers, then salient content words."""
    cues: list[str] = []
    for term in _glossary_hits(text):
        if not any(term in c for c in cues):
            cues.append(term)
        if len(cues) >= limit:
            return cues
    for m in _NUMBER_RE.finditer(text):
        num = m.group(0).strip()
        if num and num not in cues and any(ch.isdigit() for ch in num):
            cues.append(num.lower())
        if len(cues) >= limit:
            return cues
    for word in re.findall(r"[a-zA-Z][a-zA-Z'\-]{4,}", text):
        w = word.lower()
        if w in _STOPWORDS or any(w in c for c in cues):
            continue
        cues.append(w)
        if len(cues) >= limit:
            break
    return cues


def _weights(claims: list[str], must_idx: int) -> list[float]:
    raw = []
    for i, claim in enumerate(claims):
        w = 1.5 if i == must_idx else 1.0
        if _NUMBER_RE.search(claim):
            w += 0.25
        raw.append(w)
    total = sum(raw)
    weights = [round(w / total, 3) for w in raw]
    drift = round(1.0 - sum(weights), 3)
    if drift:
        j = max(range(len(weights)), key=lambda k: weights[k])
        weights[j] = round(weights[j] + drift, 3)
    return weights


def _question_topic(question: CanonicalQuestion | None, answer: Answer) -> str:
    if question is not None and question.topic:
        return question.topic
    text = (question.canonical_wording if question else "") or answer.concise_answer
    return infer_topic(text)


def is_behavioural(question: CanonicalQuestion | None, answer: Answer | None = None) -> bool:
    calc = (answer.calculation_representation or {}) if answer else {}
    if calc.get("topic") in {"behavioural", "behavioural_motivation"}:
        return True
    if question is None:
        return False
    if (question.topic or "").lower() in {"behavioral", "behavioural"}:
        return True
    if (question.question_type or "").lower() in {"behavioral", "behavioural", "fit"}:
        return True
    return route_topic(question) == "behavioural"


def _unit_for(key: str, topic: str) -> str:
    k = key.lower()
    if any(t in k for t in _UNIT_RATE_KEYS):
        return "%"
    if any(t in k for t in _UNIT_MULTIPLE_KEYS):
        return "x"
    return "$"


def numeric_checks_from_calc(calc: dict[str, Any] | None) -> tuple[list[RubricNumericCheck], list[str]]:
    """Recompute ``calculation_representation`` into numeric checks.

    Returns ``(checks, errors)``; any mismatch between the stated expected value
    and the calculator is an error (the rubric is then rejected).
    """
    calc = calc or {}
    topic = str(calc.get("topic") or "")
    inputs = calc.get("inputs") or {}
    expected = calc.get("expected") or {}
    if not topic or not inputs or not expected:
        return [], []
    try:
        got = run_topic(topic, inputs)
    except CalculatorError as exc:
        if "Unknown calculator topic" in str(exc):
            return [], []
        return [], [f"calculator_error:{topic}:{exc}"]
    except (KeyError, TypeError, ValueError, ZeroDivisionError) as exc:
        return [], [f"calculator_inputs:{topic}:{exc}"]

    checks: list[RubricNumericCheck] = []
    errors: list[str] = []
    for key, stated in expected.items():
        if key not in got:
            continue
        value = float(got[key])
        if abs(value - float(stated)) > max(1e-6, 1e-3 * max(abs(value), abs(float(stated)))):
            errors.append(f"numeric_mismatch:{topic}.{key}:{stated}!={value}")
            continue
        unit = _unit_for(key, topic)
        shown = value * 100.0 if unit == "%" else value
        checks.append(
            RubricNumericCheck(
                id=key,
                label=f"{topic.replace('_', ' ')}: {key.replace('_', ' ')}",
                calculator=CALCULATOR_IDS.get(topic, topic),
                inputs=dict(inputs),
                expected=round(shown, 6),
                tolerance=0.02,
                tolerance_kind="relative",
                unit=unit,
            )
        )
    return checks, errors


def _recompute_check(check: RubricNumericCheck, topic_by_calc: dict[str, str]) -> bool:
    """Re-run the calculator for ``check`` and compare the keyed output."""
    topic = topic_by_calc.get(check.calculator or "", check.calculator or "")
    if not check.inputs:
        return True
    try:
        got = run_topic(topic, dict(check.inputs))
    except (CalculatorError, KeyError, TypeError, ValueError, ZeroDivisionError):
        return False
    if check.id not in got:
        return False
    value = float(got[check.id]) * (100.0 if check.unit == "%" else 1.0)
    tol = (
        check.tolerance * max(abs(value), abs(check.expected), 1e-9)
        if check.tolerance_kind == "relative"
        else check.tolerance
    )
    return abs(value - check.expected) <= max(tol, 1e-6)


_TOPIC_BY_CALCULATOR = {v: k for k, v in CALCULATOR_IDS.items()}


_NONCASH_RE = re.compile(r"depreciation|write-?(down|off)|impairment", re.IGNORECASE)


def _mentions(body: str, value: float) -> bool:
    forms = {f"{abs(value):.2f}", f"{abs(value):.1f}", f"{abs(value):g}"}
    return any(re.search(rf"(?<![\d.]){re.escape(f)}(?![\d])", body) for f in forms)


def derive_question_calc(
    question: CanonicalQuestion | None, answer: Answer
) -> dict[str, Any] | None:
    """Calculator-backed check for computational source answers.

    Only for non-cash-charge questions stating both a $ amount and a tax rate
    (e.g. "$10 of depreciation at a 25% tax rate"), and only when the teaching
    answer itself states the recomputed net-income and cash changes — so the
    check never contradicts the answer it grades.
    """
    if question is None:
        return None
    wording = question.canonical_wording or ""
    if not (_NONCASH_RE.search(wording) and "$" in wording and "%" in wording and "tax" in wording.lower()):
        return None
    from ibpe_corpus.answers.generate import _parse_amount_and_tax

    amount, tax = _parse_amount_and_tax(wording, default_amount=0.0, default_tax=-1.0)
    if amount <= 0 or tax < 0:
        return None
    flow = run_topic("three_statements", {"depreciation": amount, "tax_rate": tax})
    body = teaching_text(answer)
    if not (_mentions(body, flow["net_income_change"]) and _mentions(body, flow["cash_change"])):
        return None
    return {
        "topic": "three_statements",
        "inputs": {"depreciation": amount, "tax_rate": tax},
        "expected": {
            "net_income_change": flow["net_income_change"],
            "cash_change": flow["cash_change"],
        },
        "derived_from": "question_wording",
    }


def validate_rubric(rubric: AnswerRubric, *, answer: Answer | None = None) -> list[str]:
    """Return validation errors (empty list = valid)."""
    errors: list[str] = []
    kps = rubric.key_points
    if not kps:
        errors.append("no_key_points")
    if len(kps) > MAX_KEY_POINTS:
        errors.append(f"too_many_key_points:{len(kps)}")
    total = sum(kp.weight for kp in kps)
    if abs(total - 1.0) > WEIGHT_TOLERANCE:
        errors.append(f"weights_sum:{total:.4f}")
    if not any(kp.must_have for kp in kps):
        errors.append("no_must_have")
    ids = [kp.id for kp in kps]
    if len(set(ids)) != len(ids):
        errors.append("duplicate_key_point_ids")
    if any(not kp.text.strip() for kp in kps):
        errors.append("empty_key_point")
    for check in rubric.numeric_checks:
        if not _recompute_check(check, _TOPIC_BY_CALCULATOR):
            errors.append(f"numeric_recompute_failed:{check.id}")
    if answer is not None:
        _, calc_errors = numeric_checks_from_calc(answer.calculation_representation)
        errors.extend(calc_errors)
    return errors


def grounded(rubric: AnswerRubric, answer: Answer) -> bool:
    """Every key point shares a cue (or its text) with the teaching answer."""
    body = teaching_text(answer).lower()
    for kp in rubric.key_points:
        if kp.text.lower() in body:
            continue
        cues = [c.lower() for c in kp.cues if c.strip()]
        if not cues or not any(c in body for c in cues):
            return False
    return True


# --------------------------------------------------------------------------- #
# Producers                                                                   #
# --------------------------------------------------------------------------- #


def _follow_ups(answer: Answer, topic: str) -> list[str]:
    fus = [f for f in answer.follow_ups if f and f.strip()][:3]
    if len(fus) >= 2:
        return fus
    defaults = _TOPIC_FOLLOW_UPS.get(topic, _DEFAULT_FOLLOW_UPS)
    for d in defaults:
        if d not in fus:
            fus.append(d)
        if len(fus) >= 2:
            break
    return fus


def heuristic_rubric(answer: Answer, question: CanonicalQuestion | None = None) -> AnswerRubric:
    """Extractive rubric from the teaching answer (no LLM)."""
    if is_behavioural(question, answer):
        return star_rubric(answer, question)

    topic = _question_topic(question, answer)
    concise = _norm(answer.concise_answer)
    claims = _select_claims(_claims(answer), concise) or [concise or _norm(answer.expanded_explanation)]
    must_idx = 0
    weights = _weights(claims, must_idx)
    key_points = [
        RubricKeyPoint(
            id=f"k{i + 1}",
            text=claim,
            weight=weights[i],
            must_have=(i == must_idx),
            cues=derive_cues(claim),
        )
        for i, claim in enumerate(claims)
    ]

    calc = answer.calculation_representation or derive_question_calc(question, answer)
    checks, _ = numeric_checks_from_calc(calc)
    wording = question.canonical_wording if question else ""
    # Numeric checks only when the question itself is computational.
    if not re.search(r"\d", wording or ""):
        checks = []

    mistakes = [m for m in answer.common_mistakes if m and m.strip()]
    red_flags = mistakes[:3] or list(_TOPIC_RED_FLAGS.get(topic, _DEFAULT_RED_FLAGS))
    return AnswerRubric(
        version=RUBRIC_VERSION,
        # The grader treats kind="numeric" as numbers-only; walkthroughs that
        # merely contain numbers stay "technical" (key points + numeric checks).
        kind="numeric" if checks and _PURE_CALC_RE.search(wording or "") else "technical",
        key_points=key_points,
        red_flags=red_flags,
        common_mistakes=mistakes or list(_TOPIC_RED_FLAGS.get(topic, [])),
        follow_ups=_follow_ups(answer, topic),
        numeric_checks=checks,
        provenance="heuristic",
        review_status="pending",
        model=HEURISTIC_MODEL,
        prompt_version=None,
        generated_at=utcnow().isoformat(),
    )


def star_rubric(answer: Answer, question: CanonicalQuestion | None = None) -> AnswerRubric:
    """STAR (experience) or motivation rubric for behavioural / fit questions."""
    wording = (question.canonical_wording if question else "") or ""
    experience = re.search(
        r"tell me about a time|describe a (situation|time)|a time when|give (me )?an example|"
        r"\bfailed\b|\bfailure\b|mistake|conflict|\bteam\b|lead|pressure|deadline|ethic|disagree",
        wording,
        re.IGNORECASE,
    )
    declared = str((answer.calculation_representation or {}).get("rubric_type") or "")
    if declared in {"star", "motivation"}:
        motivation = declared == "motivation"
    else:
        motivation = bool(_MOTIVATION_RE.search(wording)) and not experience
    if motivation:
        spec = [
            ("Gives two or three specific, personal reasons rather than generic statements", 0.3, True,
             ["because", "reason", "specific", "interested"]),
            ("Backs each reason with evidence from their own experience", 0.25, False,
             ["experience", "internship", "worked", "project", "when i"]),
            ("Shows role- or firm-specific knowledge (deals, groups, culture, people met)", 0.25, False,
             ["firm", "team", "deal", "group", "culture", "spoke"]),
            ("Connects the answer to the role and a credible longer-term goal", 0.2, False,
             ["role", "analyst", "associate", "goal", "learn", "long-term"]),
        ]
        red_flags = list(_MOTIVATION_RED_FLAGS)
    else:
        spec = [
            ("Situation: sets the context briefly", 0.15, False, ["situation", "when", "during", "context"]),
            ("Task: states their own responsibility or goal", 0.15, False,
             ["responsible", "task", "my role", "goal", "needed to"]),
            ("Action: specific steps they personally took", 0.35, True,
             ["i decided", "i built", "i led", "i organised", "i analysed", "i spoke", "action"]),
            ("Result: a concrete, ideally quantified outcome", 0.25, True,
             ["result", "outcome", "%", "increased", "reduced", "delivered", "won"]),
            ("Reflection: what they learned or would do differently", 0.10, False,
             ["learned", "learnt", "next time", "since then", "would"]),
        ]
        red_flags = list(_STAR_RED_FLAGS)
    key_points = [
        RubricKeyPoint(id=f"k{i + 1}", text=text, weight=w, must_have=must, cues=cues)
        for i, (text, w, must, cues) in enumerate(spec)
    ]
    mistakes = [m for m in answer.common_mistakes if m and m.strip()]
    return AnswerRubric(
        version=RUBRIC_VERSION,
        kind="star",
        key_points=key_points,
        red_flags=red_flags,
        common_mistakes=mistakes,
        follow_ups=_follow_ups(answer, "behavioral"),
        numeric_checks=[],
        provenance="heuristic",
        review_status="pending",
        model=HEURISTIC_MODEL,
        prompt_version=None,
        generated_at=utcnow().isoformat(),
    )


RUBRIC_PROMPT = """You write grading rubrics for IB/PE interview answers.
Use ONLY the teaching answer below — never outside or Glassdoor content.
Return JSON: {{"kind": "technical|numeric|star", "key_points": [{{"id": "k1", "text": str,
"weight": float, "must_have": bool, "cues": [str]}}], "red_flags": [str],
"common_mistakes": [str], "follow_ups": [str, str]}}.
Rules: 2-6 key points, weights sum to 1.0, at least one must_have (the core
definitional claim), cues are short phrases copied from the teaching answer.

QUESTION: {question}
TEACHING ANSWER: {answer}
"""


def llm_rubric(
    answer: Answer,
    question: CanonicalQuestion | None,
    call: LlmCall,
    *,
    model: str | None = None,
) -> AnswerRubric | None:
    """Rubric via prompt ``rubric-v1``; ``None`` when the output is unusable."""
    prompt = RUBRIC_PROMPT.format(
        question=(question.canonical_wording if question else ""),
        answer=teaching_text(answer),
    )
    try:
        payload = call(prompt)
        if isinstance(payload, str):
            payload = json.loads(payload)
        kps = [
            RubricKeyPoint(
                id=str(kp.get("id") or f"k{i + 1}"),
                text=str(kp["text"]),
                weight=float(kp["weight"]),
                must_have=bool(kp.get("must_have")),
                cues=[str(c) for c in (kp.get("cues") or [])][:6],
            )
            for i, kp in enumerate(payload.get("key_points") or [])
        ]
        checks, _ = numeric_checks_from_calc(answer.calculation_representation)
        kind = str(payload.get("kind") or ("numeric" if checks else "technical"))
        if kind not in {"technical", "numeric", "star"}:
            kind = "technical"
        return AnswerRubric(
            version=RUBRIC_VERSION,
            kind=kind,  # type: ignore[arg-type]
            key_points=kps,
            red_flags=[str(x) for x in payload.get("red_flags") or []][:5],
            common_mistakes=[str(x) for x in payload.get("common_mistakes") or []][:5],
            follow_ups=[str(x) for x in payload.get("follow_ups") or []][:3],
            numeric_checks=checks,
            provenance="llm",
            review_status="pending",
            model=model,
            prompt_version=RUBRIC_PROMPT_VERSION,
            generated_at=utcnow().isoformat(),
        )
    except Exception:  # noqa: BLE001 — model output is untrusted; fall back
        return None


def build_rubric(
    answer: Answer,
    question: CanonicalQuestion | None = None,
    *,
    llm_call: LlmCall | None = None,
    model: str | None = None,
) -> AnswerRubric:
    """Produce a validated rubric; ``review_status`` reflects the validators."""
    from ibpe_corpus.answers.generate import is_placeholder_answer

    if is_placeholder_answer(answer):
        # Placeholders are withheld from publish; never approve a rubric for one.
        return heuristic_rubric(answer, question).model_copy(update={"review_status": "rejected"})
    if llm_call is not None and not is_behavioural(question, answer):
        candidate = llm_rubric(answer, question, llm_call, model=model)
        if candidate is not None:
            errors = validate_rubric(candidate, answer=answer)
            if not errors and grounded(candidate, answer):
                return candidate.model_copy(update={"review_status": "approved"})

    rubric = heuristic_rubric(answer, question)
    errors = validate_rubric(rubric, answer=answer)
    return rubric.model_copy(update={"review_status": "rejected" if errors else "approved"})


def attach_rubrics(
    answers: Sequence[Answer],
    questions: Sequence[CanonicalQuestion],
    *,
    llm_call: LlmCall | None = None,
    model: str | None = None,
) -> tuple[list[Answer], dict[str, int]]:
    """Attach a rubric to every answer (existing approved human/source rubrics kept)."""
    by_id = {q.id: q for q in questions}
    out: list[Answer] = []
    stats = {"rubrics": 0, "approved": 0, "rejected": 0, "pending": 0, "llm": 0, "star": 0, "numeric": 0}
    for ans in answers:
        existing = ans.rubric
        if existing is not None and existing.provenance in {"human", "source"}:
            rubric = existing
        else:
            rubric = build_rubric(ans, by_id.get(ans.canonical_question_id), llm_call=llm_call, model=model)
        stats["rubrics"] += 1
        stats[rubric.review_status] += 1
        if rubric.provenance == "llm":
            stats["llm"] += 1
        if rubric.kind == "star":
            stats["star"] += 1
        if rubric.numeric_checks:
            stats["numeric"] += 1
        out.append(ans.model_copy(update={"rubric": rubric}))
    return out, stats
