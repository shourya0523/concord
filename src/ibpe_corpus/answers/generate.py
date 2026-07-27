"""Deterministic template/heuristic answer generator for common IB/PE topics."""

from __future__ import annotations

import re
from typing import Any, Callable

from ibpe_corpus import GENERATOR_VERSION
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    CanonicalQuestion,
    ValidationStatus,
)

TopicHandler = Callable[[CanonicalQuestion], Answer]


def generate_answer(question: CanonicalQuestion) -> Answer:
    """Generate a synthesised answer via topic keyword routing + templates.

    Always labels output as ``synthesised_unvalidated`` — never ``source_provided``.
    """
    topic_key = _route_topic(question)
    handler = _HANDLERS.get(topic_key, _generic_handler)
    answer = handler(question)
    # Hard invariant: synthesised content must never be source_provided.
    assert answer.provenance_type != AnswerProvenance.SOURCE_PROVIDED
    answer.provenance_type = AnswerProvenance.SYNTHESISED_UNVALIDATED
    answer.generator_version = GENERATOR_VERSION
    answer.validation_status = ValidationStatus.NOT_RUN
    return answer


def _route_topic(question: CanonicalQuestion) -> str:
    blob = " ".join(
        filter(
            None,
            [
                question.canonical_wording,
                question.topic,
                question.subtopic,
            ],
        )
    ).lower()

    rules: list[tuple[str, re.Pattern[str]]] = [
        ("paper_lbo", re.compile(r"\bpaper\s*lbo\b")),
        ("lbo", re.compile(r"\b(lbo|leveraged buyout|buyout model)\b")),
        ("moic_irr", re.compile(r"\b(moic|money[- ]on[- ]money|irr|internal rate)\b")),
        ("wacc", re.compile(r"\bwacc\b|weighted average cost of capital")),
        ("ev_bridge", re.compile(r"\b(ev bridge|enterprise value|equity value|net debt)\b")),
        ("accretion_dilution", re.compile(r"\b(accretion|dilution|accretive|dilutive)\b")),
        ("dcf", re.compile(r"\b(dcf|discounted cash flow|unlevered fcf|terminal value)\b")),
        (
            "three_statements",
            re.compile(r"\b(3[- ]statements?|three statements?|linking statements|"
                       r"income statement.*balance sheet|cash flow statement)\b"),
        ),
    ]
    for key, pat in rules:
        if pat.search(blob):
            return key
    return "generic"


def _base(
    question: CanonicalQuestion,
    *,
    concise: str,
    expanded: str,
    assumptions: list[str],
    calc: dict[str, Any] | None,
    mistakes: list[str],
    follow_ups: list[str],
    difficulty: str,
    references: list[str],
    confidence: float = 0.65,
) -> Answer:
    return Answer(
        canonical_question_id=question.id,
        concise_answer=concise,
        expanded_explanation=expanded,
        assumptions=assumptions,
        calculation_representation=calc,
        common_mistakes=mistakes,
        follow_ups=follow_ups,
        provenance_type=AnswerProvenance.SYNTHESISED_UNVALIDATED,
        source_ids=[],
        generator_version=GENERATOR_VERSION,
        validator_version=None,
        validation_status=ValidationStatus.NOT_RUN,
        confidence=confidence,
        difficulty=difficulty,
        references=references,
    )


def _dcf_handler(question: CanonicalQuestion) -> Answer:
    return _base(
        question,
        concise=(
            "A DCF values a firm as the present value of expected free cash flows "
            "plus terminal value, discounted at WACC (unlevered) or cost of equity (levered)."
        ),
        expanded=(
            "Build unlevered free cash flow (EBIT(1−t) + D&A − CapEx − ΔNWC) over an "
            "explicit forecast, then add a terminal value (exit multiple or Gordon growth). "
            "Discount at WACC to get enterprise value; subtract net debt for equity value. "
            "Sanity-check with comps and implied exit multiples."
        ),
        assumptions=[
            "Tax rate applied to EBIT for NOPAT",
            "Stable mid-cycle margins and reinvestment",
            "Terminal growth ≤ long-run nominal GDP growth",
            "WACC reflects target capital structure",
        ],
        calc={
            "topic": "dcf",
            "formula": "EV = Σ FCFF_t / (1+WACC)^t + TV_n / (1+WACC)^n",
            "inputs": {
                "fcff": [100.0, 110.0, 120.0],
                "wacc": 0.10,
                "terminal_growth": 0.02,
                "tax_rate": 0.25,
            },
            "steps": ["project_fcff", "compute_tv", "discount", "bridge_to_equity"],
        },
        mistakes=[
            "Double-counting interest by mixing FCFF with cost of equity",
            "Using a terminal growth above WACC",
            "Forgetting ΔNWC or CapEx in FCFF",
        ],
        follow_ups=[
            "Walk me from unlevered FCF to equity value",
            "How would you sensitize WACC and terminal growth?",
        ],
        difficulty="medium",
        references=["IB technical: DCF"],
    )


def _three_statements_handler(question: CanonicalQuestion) -> Answer:
    return _base(
        question,
        concise=(
            "The three statements link via net income → retained earnings / cash, "
            "and balance-sheet changes that drive the cash flow statement."
        ),
        expanded=(
            "Net income from the income statement flows to the cash flow statement "
            "(starting point of CFO) and to shareholders' equity via retained earnings. "
            "Non-cash charges (D&A) are added back; ΔNWC and CapEx appear on the CFS and "
            "reconcile to ending cash on the balance sheet. Always check: ending cash, "
            "equity roll-forward, and that the balance sheet balances."
        ),
        assumptions=[
            "No unusual OCI or off-statement items unless stated",
            "Tax rate consistent across P&L and deferred tax if modelled",
        ],
        calc={
            "topic": "three_statements",
            "formula": "Ending cash = Beginning cash + CFO + CFI + CFF",
            "links": ["NI→RE", "NI→CFO", "ΔBS→CFS"],
        },
        mistakes=[
            "Changing depreciation on IS without updating BS PP&E and CFS",
            "Ignoring the tax shield on interest when linking",
        ],
        follow_ups=[
            "What happens to the three statements if depreciation increases by $10?",
            "Walk me through a $10 increase in deferred revenue.",
        ],
        difficulty="easy",
        references=["IB technical: three statements"],
    )


def _lbo_handler(question: CanonicalQuestion) -> Answer:
    return _base(
        question,
        concise=(
            "An LBO models buying a company with debt + equity, operating it, paying down "
            "debt with FCF, and exiting at a multiple to measure MOIC/IRR to sponsors."
        ),
        expanded=(
            "Sources & uses set purchase enterprise value and financing. Project EBITDA, "
            "FCF, and debt paydown. At exit, apply an exit EV/EBITDA multiple, subtract "
            "remaining net debt to get exit equity, then compute MOIC and IRR versus "
            "sponsor equity in. Paper LBOs compress this to mental math on margins, "
            "leverage, and exit multiple."
        ),
        assumptions=[
            "Entry and exit multiples (often flat unless stated)",
            "Tax rate on EBIT for FCF approximation",
            "Debt paydown from excess cash; minimum cash",
            "Management option pool / rollover if given",
        ],
        calc={
            "topic": "lbo",
            "formula": "Exit equity = Exit EV − Net debt; MOIC = Exit equity / Sponsor equity",
            "inputs": {
                "entry_ebitda": 100.0,
                "entry_multiple": 10.0,
                "leverage_turns": 6.0,
                "hold_years": 5,
                "exit_multiple": 10.0,
                "ebitda_exit": 150.0,
                "net_debt_exit": 400.0,
                "sponsor_equity": 400.0,
                "tax_rate": 0.25,
            },
            "expected": {
                "entry_ev": 1000.0,
                "exit_ev": 1500.0,
                "exit_equity": 1100.0,
                "moic": 2.75,
            },
        },
        mistakes=[
            "Using EV returns instead of equity MOIC/IRR",
            "Ignoring cash interest / mandatory amortisation",
            "Forgetting fees in sources & uses",
        ],
        follow_ups=[
            "How does more leverage change IRR if operations are unchanged?",
            "Walk through a paper LBO with these assumptions…",
        ],
        difficulty="hard",
        references=["PE technical: LBO", "Paper LBO"],
    )


def _paper_lbo_handler(question: CanonicalQuestion) -> Answer:
    ans = _lbo_handler(question)
    ans.concise_answer = (
        "A paper LBO is a mental-math LBO: entry equity, grow EBITDA, apply exit "
        "multiple, subtract remaining debt, then quote MOIC and approximate IRR."
    )
    ans.difficulty = "medium"
    if ans.calculation_representation is not None:
        ans.calculation_representation = {
            **ans.calculation_representation,
            "topic": "paper_lbo",
        }
    return ans


def _ev_bridge_handler(question: CanonicalQuestion) -> Answer:
    return _base(
        question,
        concise=(
            "Enterprise value equals equity value plus net debt (and typically preferred, "
            "NCI, and other debt-like items), bridging trading price to firm value."
        ),
        expanded=(
            "Start from diluted equity value (share price × diluted shares). Add gross debt, "
            "preferred stock, NCI, and other debt-like claims; subtract cash and cash "
            "equivalents (and sometimes investments) to reach enterprise value. The bridge "
            "must be consistent with whether you are talking operating EV or total firm value."
        ),
        assumptions=[
            "Cash is surplus / non-operating unless stated otherwise",
            "Diluted shares include in-the-money options (treasury method)",
            "Leases treated per chosen EV definition (capitalised vs operating)",
            "SBC dilution reflected in share count, not double-counted in EV",
        ],
        calc={
            "topic": "ev_bridge",
            "formula": "EV = Equity value + Net debt (+ preferred + NCI)",
            "inputs": {
                "equity_value": 800.0,
                "gross_debt": 300.0,
                "cash": 100.0,
                "preferred": 0.0,
                "nci": 0.0,
            },
            "expected": {"net_debt": 200.0, "enterprise_value": 1000.0},
        },
        mistakes=[
            "Forgetting diluted shares",
            "Subtracting gross debt instead of adding it",
            "Mixing equity value and EV multiples",
        ],
        follow_ups=[
            "How do operating leases affect EV under IFRS 16?",
            "Where does NCI sit in the bridge?",
        ],
        difficulty="easy",
        references=["IB technical: EV vs equity value"],
    )


def _wacc_handler(question: CanonicalQuestion) -> Answer:
    return _base(
        question,
        concise=(
            "WACC is the blended required return on capital: "
            "E/V×Re + D/V×Rd×(1−t), using target weights and after-tax cost of debt."
        ),
        expanded=(
            "Estimate cost of equity (CAPM: Rf + β×ERP), cost of debt from yield/spread, "
            "and a tax rate for the interest tax shield. Use market-value weights at the "
            "target capital structure. WACC discounts unlevered free cash flows to firm."
        ),
        assumptions=[
            "Tax rate for after-tax cost of debt",
            "Target (not necessarily current) capital structure weights",
            "Beta relevered to target leverage",
            "Lease / hybrid capital treated consistently in D and V",
        ],
        calc={
            "topic": "wacc",
            "formula": "WACC = E/V * Re + D/V * Rd * (1 - Tc)",
            "inputs": {
                "equity_weight": 0.6,
                "cost_of_equity": 0.10,
                "debt_weight": 0.4,
                "cost_of_debt": 0.05,
                "tax_rate": 0.25,
            },
            "expected": {"wacc": 0.075},
        },
        mistakes=[
            "Using pre-tax cost of debt in WACC",
            "Mixing book weights with market costs",
            "Discounting FCFF at cost of equity",
        ],
        follow_ups=[
            "How does higher leverage change WACC in theory vs practice?",
            "Walk through unlevering and relevering beta.",
        ],
        difficulty="medium",
        references=["IB technical: WACC"],
    )


def _accretion_dilution_handler(question: CanonicalQuestion) -> Answer:
    return _base(
        question,
        concise=(
            "An deal is EPS-accretive if combined EPS rises versus stand-alone acquirer EPS; "
            "dilutive if combined EPS falls — driven by financing mix, premiums, and synergies."
        ),
        expanded=(
            "Build pro-forma net income (buyer NI + target NI − after-tax forgone interest on "
            "cash + after-tax interest on new debt − new preferred dividends + synergies − "
            "synergy costs) and divide by pro-forma diluted shares (including stock issued). "
            "Compare to buyer stand-alone EPS. Accretion/dilution is not the same as value creation."
        ),
        assumptions=[
            "Tax rate on interest expense / income and synergies",
            "Synergy timing and realisation rate",
            "Purchase accounting / amortisation of intangibles if included",
            "SBC and new share issuance in the denominator",
        ],
        calc={
            "topic": "accretion_dilution",
            "formula": "Accretion% = (Pro forma EPS / Standalone EPS) - 1",
            "inputs": {
                "buyer_ni": 200.0,
                "target_ni": 50.0,
                "synergies_after_tax": 10.0,
                "incremental_after_tax_interest": 8.0,
                "pro_forma_shares": 110.0,
                "standalone_eps": 2.0,
                "tax_rate": 0.25,
            },
            "expected": {"pro_forma_ni": 252.0, "pro_forma_eps": 2.2909090909},
        },
        mistakes=[
            "Ignoring new shares in a stock deal",
            "Using pre-tax synergies against after-tax interest",
            "Equating EPS accretion with a good deal",
        ],
        follow_ups=[
            "Why can an accretive deal still destroy value?",
            "How do cash vs stock mixes change accretion?",
        ],
        difficulty="medium",
        references=["IB technical: merger accretion/dilution"],
    )


def _moic_irr_handler(question: CanonicalQuestion) -> Answer:
    return _base(
        question,
        concise=(
            "MOIC is total equity returned ÷ equity invested; IRR is the annualised rate "
            "that sets NPV of the equity cash flows to zero."
        ),
        expanded=(
            "For a single entry and exit: MOIC = Exit equity / Entry equity. "
            "Approximate IRR ≈ MOIC^(1/n) − 1 for a single bullet exit after n years. "
            "With interim distributions, solve IRR from the full cash-flow schedule."
        ),
        assumptions=[
            "Hold period in years",
            "No intermediate dividends unless modelled",
            "Exit equity already net of debt and fees",
        ],
        calc={
            "topic": "moic_irr",
            "formula": "MOIC = Exit / Entry; IRR ≈ MOIC^(1/n) - 1",
            "inputs": {
                "entry_equity": 100.0,
                "exit_equity": 250.0,
                "years": 5,
            },
            "expected": {
                "moic": 2.5,
                "irr_approx": 2.5 ** (1 / 5) - 1,
            },
        },
        mistakes=[
            "Quoting MOIC as an annual return",
            "Using enterprise value instead of equity value",
            "Ignoring timing of intermediate cash flows",
        ],
        follow_ups=[
            "What MOIC equates to a ~20% IRR over five years?",
            "How do dividends change MOIC vs IRR?",
        ],
        difficulty="easy",
        references=["PE technical: MOIC and IRR"],
    )


def _generic_handler(question: CanonicalQuestion) -> Answer:
    wording = question.canonical_wording.strip()
    return _base(
        question,
        concise=(
            f"Structure a clear interview answer to: {wording[:160]}"
            + ("…" if len(wording) > 160 else "")
        ),
        expanded=(
            "State the definition or framework first, walk through the logical steps, "
            "call out key assumptions, and close with a quick sanity check or follow-up "
            "the interviewer may ask. Prefer concrete formulas over buzzwords."
        ),
        assumptions=["Interview context and seniority as stated in the prompt"],
        calc={"topic": "generic"},
        mistakes=["Jumping to jargon without a structured walkthrough"],
        follow_ups=["What is the follow-up numerical example?"],
        difficulty=question.difficulty or "medium",
        references=[],
        confidence=0.4,
    )


_HANDLERS: dict[str, TopicHandler] = {
    "dcf": _dcf_handler,
    "three_statements": _three_statements_handler,
    "lbo": _lbo_handler,
    "paper_lbo": _paper_lbo_handler,
    "ev_bridge": _ev_bridge_handler,
    "wacc": _wacc_handler,
    "accretion_dilution": _accretion_dilution_handler,
    "moic_irr": _moic_irr_handler,
    "generic": _generic_handler,
}
