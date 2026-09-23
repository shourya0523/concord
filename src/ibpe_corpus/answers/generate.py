"""Deterministic template/heuristic answer generator for common IB/PE topics.

Each topic handler returns a teaching answer (concise + expanded + assumptions,
worked calculation where one applies, mistakes, follow-ups). ``_FACETS`` add
question-specific lead sentences so e.g. "What does negative working capital
mean?" is answered directly instead of receiving only the topic overview.

Provenance is always ``synthesised_*`` (never ``source_provided``). When no
topic handler fits, ``_generic_handler`` emits a placeholder that is marked
``needs_generation`` and withheld by the publish gate (plan P1.3).
"""

from __future__ import annotations

import re
from typing import Any, Callable

from ibpe_corpus import GENERATOR_VERSION
from ibpe_corpus.answers.calculators import (
    CalculatorError,
    accretion_dilution as calc_accretion,
    carried_interest,
    dcf_enterprise_value,
    depreciation_flow,
    implied_valuation,
    leverage_metrics,
    net_working_capital,
)
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    CanonicalQuestion,
    ValidationStatus,
)

TopicHandler = Callable[[CanonicalQuestion], Answer]

# Literal prefix of the generic placeholder — the publish gate rejects it.
PLACEHOLDER_PREFIX = "Structure a clear interview answer to:"
_PLACEHOLDER_RE = re.compile(r"^\s*structure a clear interview answer to\s*:", re.IGNORECASE)


def is_placeholder_text(text: str | None) -> bool:
    """True when ``text`` is the ``_generic_handler`` placeholder template."""
    return bool(_PLACEHOLDER_RE.match(text or ""))


def is_placeholder_answer(answer: Answer) -> bool:
    calc = answer.calculation_representation or {}
    return (
        is_placeholder_text(answer.concise_answer)
        or answer.validation_status == ValidationStatus.NEEDS_GENERATION
        or (calc.get("topic") == "generic" and bool(answer.generator_version))
    )


def generate_answer(question: CanonicalQuestion) -> Answer:
    """Generate a synthesised answer via topic keyword routing + templates.

    Always labels output as ``synthesised_unvalidated`` — never ``source_provided``.
    Generic placeholders get ``validation_status=needs_generation``.
    """
    topic_key = route_topic(question)
    handler = _HANDLERS.get(topic_key, _generic_handler)
    answer = handler(question)
    if topic_key != "generic":
        answer = _apply_facets(topic_key, question, answer)
    # Hard invariant: synthesised content must never be source_provided.
    assert answer.provenance_type != AnswerProvenance.SOURCE_PROVIDED
    answer.provenance_type = AnswerProvenance.SYNTHESISED_UNVALIDATED
    answer.generator_version = GENERATOR_VERSION
    answer.validation_status = (
        ValidationStatus.NEEDS_GENERATION if topic_key == "generic" else ValidationStatus.NOT_RUN
    )
    return answer


def _c(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern, re.IGNORECASE)


_BEHAVIOURAL_STRONG = _c(
    r"tell me about (a time|yourself)|walk me through your (resume|cv|background)|"
    r"why (do you want to (do|work in|go into) )?(ib|investment banking|banking|private equity|pe|"
    r"capital markets|m&a|restructuring)\b|why (are|is) (we|us|our)\b|why (this|our) (firm|bank|fund|team)|"
    r"first choice|\bweakness|\bstrengths?\b|describe a (situation|time)|a time when you|"
    r"where else (are you|did you)|\binterviewing\b|greatest (achievement|accomplishment)|"
    r"\bteamwork\b|\bleadership\b|\bfailure\b|\bfailed\b|made a mistake|\bhours\b|\blifestyle\b|"
    r"career goal|long.term plans?|see yourself|still be an? (investment )?banker|"
    r"why did you (attend|choose|transfer|study)|"
    r"why .{0,20}(goldman|morgan stanley|jpmorgan|jp morgan|evercore|lazard|blackstone|kkr|"
    r"centerview|moelis|pjt|citi|barclays|ubs|bank of america)|"
    r"stay (up.to.date|updated|informed|current)|have you (ever )?worked (with|on|at)|"
    r"(details|describe) (of )?your (experience|background)|your experience in"
)

_ROUTES: list[tuple[str, re.Pattern[str]]] = [
    ("behavioural", _BEHAVIOURAL_STRONG),
    ("paper_lbo", _c(r"\bpaper\s*lbo\b")),
    ("lbo", _c(r"\b(lbo|leveraged buyout|buyout model|dividend recap)")),
    ("moic_irr", _c(r"\b(moic|money[- ]on[- ]money|irr|internal rate)\b")),
    ("pe_fund", _c(r"carried interest|\bcarry\b|management fee|limited partners?|general partners?|"
                   r"\b(lp|gp)s?\b|fund (life|structure|economics)|hurdle rate|preferred return|"
                   r"distribution waterfall|\bdpi\b|\btvpi\b|\bvintage\b|dry powder|fundrais")),
    ("wacc", _c(r"\bwacc\b|weighted average cost of capital|cost of (equity|debt|capital)|\bcapm\b|\bbeta\b")),
    ("ev_bridge", _c(r"\b(ev bridge|enterprise value|equity value|net debt|minority interest|"
                     r"non-?controlling|treasury stock method|diluted shares)\b")),
    ("accretion_dilution", _c(r"\b(accretion|dilution|accretive|dilutive|merger model|pro forma eps)\b")),
    ("dcf", _c(r"\b(dcf|discounted cash flow|unlevered fcf|levered fcf|free cash flow|terminal value|"
               r"gordon growth|perpetuity growth|mid-?year convention)\b")),
    ("comps_precedents", _c(r"comparable compan|\bcomps\b|precedent|trading multiples|transaction multiples")),
    ("valuation_multiples", _c(r"\bmultiples?\b|ev\s*/\s*ebitda|\bp\s*/\s*e\b|price.to.earnings|ev\s*/\s*revenue")),
    ("working_capital", _c(r"working capital|\bnwc\b|receivables?|payables?|\binventory\b|\bdso\b|"
                           r"cash conversion cycle")),
    ("debt_credit", _c(r"covenant|\bbonds?\b|\bloans?\b|leverage ratio|\bcredit\b|high.yield|"
                       r"debt (capacity|financing|instrument)|interest coverage|\bpik\b|refinanc|"
                       r"seniority|(senior|subordinated) (debt|notes)|term loan|revolver")),
    ("restructuring", _c(r"restructur|bankrupt|distress|chapter (7|11)|liquidation|creditors?\b|fulcrum")),
    ("three_statements", _c(r"3[- ]statements?|three (financial )?statements?|linking statements|"
                            r"income statement|balance sheet|cash flow statement|financial statements|"
                            r"depreciation|amortization|goodwill|deferred (tax|revenue)|write-?(down|off)|"
                            r"impairment|retained earnings|shareholders.? equity|\bcapex\b|"
                            r"capital expenditure|accounting")),
    ("investment_thesis", _c(r"pitch (me )?(a |an )?(stock|company|investment)|stock pitch|"
                             r"investment (idea|thesis)|would you invest|company you admire")),
    ("ma_process", _c(r"sell-?side|buy-?side|pitch ?book|\bauction\b|m&a process|\bipo\b|fairness opinion|"
                      r"(stock|asset) purchase|what (do )?(investment )?bankers|deal process|"
                      r"investment bank(ing)?\b|\bm&a\b|mergers? and acquisitions|acquisition targets?")),
    ("pe_overview", _c(r"private equity|\bpe (firm|fund|analyst|associate|industry|landscape)|"
                       r"due diligence|buy-?out (firm|fund)")),
    ("valuation_overview", _c(r"\bvalu(e|ation|ing)\b")),
]


def route_topic(question: CanonicalQuestion) -> str:
    blob = " ".join(
        filter(None, [question.canonical_wording, question.topic, question.subtopic])
    )
    for key, pat in _ROUTES:
        if pat.search(blob):
            return key
    if (question.topic or "").lower() in {"behavioral", "behavioural"}:
        return "behavioural"
    return "generic"


# Backwards-compatible private alias.
_route_topic = route_topic


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
    inputs = {"fcff": [100.0, 110.0, 120.0], "wacc": 0.10, "terminal_growth": 0.02}
    expected = dcf_enterprise_value(**inputs)
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
            "Sanity-check with comps and implied exit multiples. Worked example: FCFF of "
            "100, 110 and 120 at a 10% WACC with 2% terminal growth gives a terminal value of "
            f"{expected['terminal_value']:,.0f} (120 × 1.02 / 8%) and an enterprise value of "
            f"about {expected['enterprise_value']:,.0f}."
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
            "inputs": {**inputs, "tax_rate": 0.25},
            "expected": {
                "terminal_value": expected["terminal_value"],
                "enterprise_value": expected["enterprise_value"],
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
    calc: dict[str, Any] = {
        "topic": "three_statements",
        "formula": "Ending cash = Beginning cash + CFO + CFI + CFF",
        "links": ["NI→RE", "NI→CFO", "ΔBS→CFS"],
    }
    worked = ""
    wording = question.canonical_wording or ""
    if re.search(r"depreciation|write-?(down|off)|impairment", wording, re.IGNORECASE):
        amount, tax = _parse_amount_and_tax(wording, default_amount=10.0, default_tax=0.25)
        flow = depreciation_flow(amount=amount, tax_rate=tax)
        calc = {
            **calc,
            "formula": "ΔNI = −D × (1 − t); ΔCash = ΔNI + D; ΔPP&E = −D",
            "inputs": {"depreciation": amount, "tax_rate": tax},
            "expected": {
                "net_income_change": flow["net_income_change"],
                "cash_change": flow["cash_change"],
            },
        }
        worked = (
            f" Worked example: a ${_fmt(amount)} non-cash charge at a {tax:.0%} tax rate lowers net "
            f"income by ${_fmt(-flow['net_income_change'])}, raises cash by "
            f"${_fmt(flow['cash_change'])} (the tax saving), cuts the asset by ${_fmt(amount)} and "
            f"retained earnings by ${_fmt(-flow['equity_change'])}, so the balance sheet balances."
        )
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
            "equity roll-forward, and that the balance sheet balances." + worked
        ),
        assumptions=[
            "No unusual OCI or off-statement items unless stated",
            "Tax rate consistent across P&L and deferred tax if modelled",
            "Non-cash charges are tax-deductible unless stated otherwise",
        ],
        calc=calc,
        mistakes=[
            "Changing depreciation on IS without updating BS PP&E and CFS",
            "Ignoring the tax shield on interest when linking",
            "Leaving the balance sheet unbalanced at the end of the walk",
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
            "leverage, and exit multiple. Worked example: buy $100 EBITDA at 10x (EV $1,000) "
            "with $600 of debt and $400 of equity; exit at 10x on $150 EBITDA ($1,500 EV) with "
            "$400 of net debt left → $1,100 exit equity, a 2.75x MOIC (≈22% IRR over 5 years)."
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
            "must be consistent with whether you are talking operating EV or total firm value. "
            "Worked example: $800 equity value + $300 debt − $100 cash = $1,000 enterprise value."
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
            "target capital structure. WACC discounts unlevered free cash flows to firm. "
            "Worked example: 60% equity at 10% and 40% debt at 5% with a 25% tax rate gives "
            "0.6 × 10% + 0.4 × 5% × 0.75 = 7.5%."
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
    standalone_eps = 2.0
    pro_forma_ni = 200.0 + 50.0 + 10.0 - 8.0
    pro_forma_eps = pro_forma_ni / 110.0
    delta = calc_accretion(acquirer_eps=standalone_eps, combined_eps=pro_forma_eps)["eps_delta"]
    return _base(
        question,
        concise=(
            "A deal is EPS-accretive if combined EPS rises versus stand-alone acquirer EPS; "
            "dilutive if combined EPS falls — driven by financing mix, premiums, and synergies."
        ),
        expanded=(
            "Build pro-forma net income (buyer NI + target NI − after-tax forgone interest on "
            "cash + after-tax interest on new debt − new preferred dividends + synergies − "
            "synergy costs) and divide by pro-forma diluted shares (including stock issued). "
            "Compare to buyer stand-alone EPS. Accretion/dilution is not the same as value creation. "
            "Worked example: $200 buyer NI + $50 target NI + $10 after-tax synergies − $8 after-tax "
            f"interest = ${pro_forma_ni:.0f} over 110 shares = ${pro_forma_eps:.2f} EPS vs $2.00 "
            f"stand-alone, about {delta:.1%} accretive."
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
                "standalone_eps": standalone_eps,
                "acquirer_eps": standalone_eps,
                "combined_eps": pro_forma_eps,
                "tax_rate": 0.25,
            },
            "expected": {
                "pro_forma_ni": pro_forma_ni,
                "pro_forma_eps": pro_forma_eps,
                "eps_delta": delta,
            },
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
            "With interim distributions, solve IRR from the full cash-flow schedule. "
            "Worked example: $100 in, $250 out after 5 years is a 2.5x MOIC and ≈20% IRR."
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


def _comps_precedents_handler(question: CanonicalQuestion) -> Answer:
    inputs = {"multiple": 8.0, "metric": 100.0, "net_debt": 200.0}
    out = implied_valuation(**inputs)
    return _base(
        question,
        concise=(
            "Comparable companies value a business off the trading multiples of similar public "
            "peers; precedent transactions use the multiples paid in past acquisitions of similar "
            "companies, which usually embed a control premium."
        ),
        expanded=(
            "Screen peers on industry, size, growth, margins and geography; spread revenue, EBITDA, "
            "EBIT and net income on a calendarised basis; compute EV- and equity-based multiples; "
            "take the interquartile or median range and apply it to the target's metric to get an "
            "implied enterprise value, then bridge to equity value. Precedents follow the same logic "
            "using transaction values at announcement, adjusted for market conditions at the time. "
            "Precedents tend to give higher values (control premium, synergies) and are backward-"
            "looking; comps reflect current market sentiment but carry no premium. Worked example: "
            f"8.0x EV/EBITDA on $100 EBITDA implies ${out['implied_enterprise_value']:,.0f} EV and, "
            f"after $200 of net debt, ${out['implied_equity_value']:,.0f} equity value."
        ),
        assumptions=[
            "Peers are genuinely comparable on growth, margins and risk",
            "Metrics are calendarised and adjusted for one-offs",
            "Transaction multiples reflect the market at announcement",
        ],
        calc={
            "topic": "comps_precedents",
            "formula": "Implied EV = Multiple × Metric; Equity = EV − Net debt",
            "inputs": inputs,
            "expected": out,
        },
        mistakes=[
            "Pairing EV multiples with equity metrics (e.g. EV / net income)",
            "Not calendarising fiscal years",
            "Keeping outliers or non-comparable peers in the set",
        ],
        follow_ups=[
            "Why do precedent transactions usually give higher values than comps?",
            "How would you choose the comparable set for this company?",
        ],
        difficulty="medium",
        references=["IB technical: comps and precedents"],
    )


def _valuation_multiples_handler(question: CanonicalQuestion) -> Answer:
    inputs = {"multiple": 12.0, "metric": 50.0, "net_debt": 100.0}
    out = implied_valuation(**inputs)
    return _base(
        question,
        concise=(
            "A valuation multiple scales value to an operating metric: enterprise-value multiples "
            "(EV/EBITDA, EV/Revenue) pair EV with metrics available to all capital providers, while "
            "equity multiples (P/E, P/B) pair equity value with metrics available only to shareholders."
        ),
        expanded=(
            "Always match numerator and denominator: EV with pre-interest metrics (revenue, EBITDA, "
            "EBIT), equity value with post-interest metrics (net income, book value). EV/EBITDA is the "
            "workhorse because it is capital-structure neutral and ignores D&A policy; EV/Revenue is "
            "used for unprofitable or early-stage companies; P/E suits mature and financial companies; "
            "sectors add their own (P/TBV for banks, EV/EBITDAR for airlines and retail). Multiples "
            "differ because of growth, risk and returns on capital — the same drivers as a DCF. Worked "
            f"example: 12.0x on $50 EBITDA implies ${out['implied_enterprise_value']:,.0f} EV and "
            f"${out['implied_equity_value']:,.0f} equity after $100 of net debt."
        ),
        assumptions=[
            "Metrics normalised for one-offs",
            "Consistent (LTM vs forward) periods across the peer set",
        ],
        calc={
            "topic": "valuation_multiples",
            "formula": "Implied EV = Multiple × Metric; Equity = EV − Net debt",
            "inputs": inputs,
            "expected": out,
        },
        mistakes=[
            "Mismatching EV multiples with equity-level metrics",
            "Comparing LTM multiples with forward multiples",
            "Treating a high multiple as 'expensive' without considering growth and risk",
        ],
        follow_ups=[
            "Why might two companies in the same sector trade at different EV/EBITDA multiples?",
            "When would you use EV/Revenue instead of EV/EBITDA?",
        ],
        difficulty="easy",
        references=["IB technical: valuation multiples"],
    )


def _working_capital_handler(question: CanonicalQuestion) -> Answer:
    inputs = {
        "current_operating_assets": 300.0,
        "current_operating_liabilities": 180.0,
        "prior_nwc": 100.0,
    }
    out = net_working_capital(**inputs)
    return _base(
        question,
        concise=(
            "Working capital measures short-term operating liquidity: current operating assets "
            "(receivables, inventory, prepaid expenses) minus current operating liabilities "
            "(payables, accrued expenses, deferred revenue); an increase is a use of cash."
        ),
        expanded=(
            "In models we use operating net working capital, excluding cash and short-term debt. On "
            "the cash flow statement an increase in receivables or inventory reduces cash from "
            "operations, while an increase in payables or deferred revenue increases it. Project NWC "
            "with days-based drivers (DSO, DIO, DPO) or as a % of revenue. The cash conversion cycle "
            "(DSO + DIO − DPO) shows how long cash is tied up in operations. Worked example: $300 of "
            f"operating current assets less $180 of operating current liabilities is ${out['nwc']:,.0f} "
            f"of NWC; up from $100, that ${out['delta_nwc']:,.0f} increase is a "
            f"${-out['cash_impact']:,.0f} use of cash."
        ),
        assumptions=[
            "Cash and debt excluded from operating working capital",
            "Days-based drivers stable unless the business model changes",
        ],
        calc={
            "topic": "working_capital",
            "formula": "NWC = Operating current assets − Operating current liabilities; ΔNWC ↑ = cash ↓",
            "inputs": inputs,
            "expected": out,
        },
        mistakes=[
            "Including cash or revolver debt in operating working capital",
            "Getting the cash-flow sign wrong (NWC increase is a use of cash)",
            "Assuming negative working capital is always a bad sign",
        ],
        follow_ups=[
            "What does negative working capital tell you about a business?",
            "How would you project working capital in a model?",
        ],
        difficulty="easy",
        references=["IB technical: working capital"],
    )


def _debt_credit_handler(question: CanonicalQuestion) -> Answer:
    inputs = {"total_debt": 500.0, "ebitda": 100.0, "cash": 50.0, "interest_expense": 40.0}
    out = leverage_metrics(**inputs)
    return _base(
        question,
        concise=(
            "Debt analysis centres on the borrower's ability to service and repay: leverage "
            "(Debt/EBITDA), coverage (EBITDA/interest), liquidity, and the terms — seniority, "
            "security, covenants, maturity — that protect lenders."
        ),
        expanded=(
            "Bank debt (revolvers, term loans) is typically senior secured, floating-rate, amortising "
            "and carries maintenance covenants; high-yield bonds are usually unsecured, fixed-rate, "
            "bullet maturities with incurrence covenants and call protection; mezzanine / PIK sits "
            "below and is paid more for the risk. Lenders size debt on leverage and coverage, stress-"
            "test downside cash flows, and rely on priority in the capital structure for recovery. "
            f"Worked example: $500 of debt on $100 of EBITDA is {out['gross_leverage']:.1f}x gross and "
            f"{out['net_leverage']:.1f}x net leverage after $50 of cash; $40 of interest gives "
            f"{out['interest_coverage']:.1f}x coverage."
        ),
        assumptions=[
            "EBITDA is a reasonable proxy for debt-service capacity",
            "Covenant definitions follow the credit agreement",
        ],
        calc={
            "topic": "debt_credit",
            "formula": "Leverage = Debt / EBITDA; Net = (Debt − Cash) / EBITDA; Coverage = EBITDA / Interest",
            "inputs": inputs,
            "expected": out,
        },
        mistakes=[
            "Confusing maintenance covenants with incurrence covenants",
            "Ignoring seniority and security when comparing debt instruments",
            "Using EBITDA without considering capex and cash taxes",
        ],
        follow_ups=[
            "How would you compare a term loan with a high-yield bond?",
            "What happens if a company breaches a maintenance covenant?",
        ],
        difficulty="medium",
        references=["IB technical: debt and credit"],
    )


def _pe_fund_handler(question: CanonicalQuestion) -> Answer:
    inputs = {"fund_size": 1000.0, "total_distributions": 2000.0, "carry_rate": 0.2}
    out = carried_interest(**inputs)
    return _base(
        question,
        concise=(
            "A PE fund is a limited partnership: LPs commit capital that the GP calls over an "
            "investment period, invests and later returns; the GP earns a management fee (about "
            "1.5–2% of committed capital) and carried interest (about 20% of profits, usually after "
            "an ~8% preferred return)."
        ),
        expanded=(
            "Funds typically run about ten years (a ~5-year investment period plus harvesting, with "
            "extensions). Capital is called as deals close; uncalled commitments are dry powder. "
            "Distributions follow a waterfall: return of contributed capital, the preferred return, a "
            "GP catch-up, then an 80/20 split. European (whole-fund) waterfalls pay carry only after "
            "LPs get all capital back; American (deal-by-deal) waterfalls pay earlier, usually with a "
            "clawback. Performance is reported as net IRR, TVPI (total value / paid-in) and DPI "
            "(distributions / paid-in). Worked example: a $1,000 fund returning $2,000 earns "
            f"${out['fund_profit']:,.0f} of profit and ${out['gp_carry']:,.0f} of carry at 20%, leaving "
            f"LPs a {out['net_moic']:.1f}x net multiple (before fees and hurdle mechanics)."
        ),
        assumptions=[
            "Simple whole-fund carry without hurdle or catch-up in the worked example",
            "Fee terms vary by fund size and vintage",
        ],
        calc={
            "topic": "pe_fund",
            "formula": "Carry = carry_rate × max(0, Distributions − Contributed capital)",
            "inputs": inputs,
            "expected": out,
        },
        mistakes=[
            "Confusing committed capital with invested capital",
            "Ignoring the preferred return and catch-up in the waterfall",
            "Quoting gross returns as LP net returns",
        ],
        follow_ups=[
            "How does a European waterfall differ from an American one?",
            "Why do LPs look at DPI as well as IRR?",
        ],
        difficulty="medium",
        references=["PE technical: fund mechanics"],
    )


def _valuation_overview_handler(question: CanonicalQuestion) -> Answer:
    return _base(
        question,
        concise=(
            "The main valuation methods are comparable companies and precedent transactions "
            "(relative value) and the DCF (intrinsic value); an LBO analysis shows what a financial "
            "buyer could pay. Triangulate them, usually on a football-field chart."
        ),
        expanded=(
            "Comps capture how the market values similar companies today; precedents show what "
            "acquirers have paid for control (usually the highest range); a DCF values the company on "
            "its own projected cash flows and is most sensitive to WACC and terminal assumptions; an "
            "LBO sets a floor based on a sponsor's target returns. Weight methods by data quality: "
            "mature, cash-generative businesses suit a DCF; companies with good peer sets suit comps; "
            "banks and insurers use equity-based methods (P/E, P/TBV, dividend discount models)."
        ),
        assumptions=[
            "Forecasts and peer sets are reasonable",
            "Control vs minority basis is consistent across methods",
        ],
        calc={"topic": "valuation_overview", "formula": "Value range = f(comps, precedents, DCF, LBO)"},
        mistakes=[
            "Relying on a single method without cross-checks",
            "Mixing control-premium values with minority trading values",
            "Using a DCF for companies with no predictable cash flows",
        ],
        follow_ups=[
            "Which method typically gives the highest value and why?",
            "How would you value a company with negative earnings?",
        ],
        difficulty="easy",
        references=["IB technical: valuation methods"],
    )


def _ma_process_handler(question: CanonicalQuestion) -> Answer:
    return _base(
        question,
        concise=(
            "In a sell-side M&A process the bank prepares marketing materials (teaser, CIM), runs a "
            "targeted or broad auction with staged bids and diligence, negotiates the purchase "
            "agreement and helps the client choose the best mix of price and certainty; buy-side "
            "mandates advise an acquirer on targets, valuation and bidding."
        ),
        expanded=(
            "A typical auction runs: preparation (valuation, buyer list, teaser/CIM), first-round "
            "indications of interest, management presentations and data-room diligence, final binding "
            "bids with a marked-up purchase agreement, then negotiation, signing and closing (with "
            "regulatory and financing conditions). Bankers also provide fairness opinions, coordinate "
            "lawyers and accountants, and manage competitive tension. Structuring choices — stock vs "
            "asset purchase, cash vs stock consideration — trade off tax, liabilities and certainty."
        ),
        assumptions=["Process details vary by deal size, buyer universe and jurisdiction"],
        calc={"topic": "ma_process", "formula": "Prep → IOIs → diligence → final bids → sign → close"},
        mistakes=[
            "Describing the process without the banker's role at each stage",
            "Ignoring certainty of close when comparing bids",
            "Confusing sell-side advisory with sell-side research",
        ],
        follow_ups=[
            "Why might a seller accept a lower bid?",
            "What goes into a CIM?",
        ],
        difficulty="easy",
        references=["IB: M&A process"],
    )


def _restructuring_handler(question: CanonicalQuestion) -> Answer:
    return _base(
        question,
        concise=(
            "Restructuring advisers help distressed companies fix an unsustainable capital "
            "structure — out of court (amendments, exchanges, debt-for-equity swaps) or in court "
            "(Chapter 11) — acting for either the debtor or its creditors."
        ),
        expanded=(
            "Triggers include a liquidity crunch, covenant breach or maturity wall. Advisers build a "
            "13-week cash flow, value the business (going concern vs liquidation), and negotiate how "
            "value is split: under the absolute priority rule senior claims recover first, and the "
            "fulcrum security is the class that is only partly covered and typically receives the new "
            "equity. In Chapter 11, DIP financing funds operations, and assets can be sold via a 363 "
            "sale; Chapter 7 is an outright liquidation."
        ),
        assumptions=["US bankruptcy framework unless stated"],
        calc={"topic": "restructuring", "formula": "Recovery by class = value distributed by priority"},
        mistakes=[
            "Using book equity instead of recovery values in distress",
            "Ignoring priority and security when estimating recoveries",
        ],
        follow_ups=[
            "What is a fulcrum security?",
            "Why would creditors agree to an out-of-court exchange?",
        ],
        difficulty="hard",
        references=["IB: restructuring"],
    )


def _investment_thesis_handler(question: CanonicalQuestion) -> Answer:
    return _base(
        question,
        concise=(
            "Give a crisp investment thesis: what the company does, two or three specific reasons it "
            "is attractive (market position, growth drivers, financial profile, mispricing), the key "
            "risks and how you would mitigate them, and a one-line view on valuation or expected return."
        ),
        expanded=(
            "Structure the pitch in four parts. (1) Business: what it sells, to whom and how it makes "
            "money. (2) Thesis: two or three drivers the market underappreciates, each backed by evidence "
            "(unit economics, market share, margin trajectory, catalysts). (3) Valuation: where it trades "
            "versus peers or history (e.g. EV/EBITDA, P/E) and what upside a reasonable scenario implies. "
            "(4) Risks: what would break the thesis and what you would monitor. For a private-equity "
            "angle, add how value would be created (growth, margins, add-ons) and how the deal could be "
            "financed and exited. Pick a company you genuinely follow and can defend under questioning."
        ),
        assumptions=["Figures quoted are current and from reliable public sources"],
        calc={"topic": "investment_thesis", "formula": "Upside = Target value / Current value − 1"},
        mistakes=[
            "Describing the company without an actual thesis",
            "No valuation or return view",
            "Ignoring risks or picking a stock you cannot defend in detail",
        ],
        follow_ups=[
            "What would make you change your mind on this investment?",
            "How does the valuation compare with its closest peers?",
        ],
        difficulty="medium",
        references=["Investment thesis / stock pitch"],
    )


def _pe_overview_handler(question: CanonicalQuestion) -> Answer:
    return _base(
        question,
        concise=(
            "Private equity firms raise funds from limited partners, buy controlling (buyout) or "
            "significant minority (growth) stakes in companies, improve them over roughly three to "
            "seven years and sell them, returning capital to LPs and earning carried interest."
        ),
        expanded=(
            "Unlike public-market investing, private equity takes concentrated, illiquid and often "
            "levered positions with active ownership: board seats, management incentives and a value-"
            "creation plan (revenue growth, margin improvement, add-on acquisitions, better capital "
            "structure). A deal team sources and screens opportunities, builds LBO and operating models, "
            "runs due diligence with advisers (commercial, financial / quality of earnings, legal, tax, "
            "operational), writes the investment committee memo, negotiates financing and the purchase "
            "agreement, and then works with management until exit via a sale or IPO."
        ),
        assumptions=["Buyout-style fund unless growth or credit strategies are specified"],
        calc={"topic": "pe_overview", "formula": "Returns = EBITDA growth + multiple change + deleveraging"},
        mistakes=[
            "Describing PE as passive investing",
            "Ignoring leverage and the holding-period value-creation plan",
            "Confusing private equity with hedge funds or venture capital",
        ],
        follow_ups=[
            "What makes a company a good private equity investment?",
            "How does due diligence change the valuation or deal structure?",
        ],
        difficulty="easy",
        references=["PE: industry overview"],
    )


def _behavioural_handler(question: CanonicalQuestion) -> Answer:
    return _base(
        question,
        concise=(
            "Answer with a concise STAR story: set the Situation and your Task in a sentence or two, "
            "spend most of the time on the specific Actions you took, quantify the Result, and close "
            "with what you learned and why it matters for this role."
        ),
        expanded=(
            "Use STAR plus reflection: Situation (context in 1–2 sentences), Task (your "
            "responsibility), Action (what you specifically did — the bulk of the answer), Result "
            "(a measurable outcome), Reflection (what you learned and would repeat or change). Keep "
            "it to one or two minutes, say 'I' rather than 'we', and prepare five or six adaptable "
            "stories (leadership, teamwork, failure, conflict, analytical challenge, ethics). For "
            "motivation questions, give specific reasons backed by evidence from your experience and "
            "tie them to the firm and the analyst or associate role."
        ),
        assumptions=["The answer draws on the candidate's own experience"],
        calc={"topic": "behavioural"},
        mistakes=[
            "Rambling without a clear structure",
            "Generic answers that are not tied to the firm or role",
            "Blaming others or showing no ownership",
            "No concrete, measurable result",
        ],
        follow_ups=[
            "What would you do differently next time?",
            "How did the people you worked with react to the outcome?",
        ],
        difficulty="medium",
        references=["Behavioural: STAR framework"],
        confidence=0.6,
    )


def _generic_handler(question: CanonicalQuestion) -> Answer:
    """Placeholder when no topic handler fits — never published (needs_generation)."""
    wording = question.canonical_wording.strip()
    return _base(
        question,
        concise=(
            f"{PLACEHOLDER_PREFIX} {wording[:160]}"
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
    "comps_precedents": _comps_precedents_handler,
    "valuation_multiples": _valuation_multiples_handler,
    "working_capital": _working_capital_handler,
    "debt_credit": _debt_credit_handler,
    "pe_fund": _pe_fund_handler,
    "valuation_overview": _valuation_overview_handler,
    "ma_process": _ma_process_handler,
    "investment_thesis": _investment_thesis_handler,
    "pe_overview": _pe_overview_handler,
    "restructuring": _restructuring_handler,
    "behavioural": _behavioural_handler,
    "generic": _generic_handler,
}


# --------------------------------------------------------------------------- #
# Facets: question-specific lead sentences (first match leads the concise).   #
# --------------------------------------------------------------------------- #

_FACETS: dict[str, list[tuple[re.Pattern[str], str]]] = {
    "dcf": [
        (_c(r"terminal value"), "Terminal value usually carries most of a DCF's value (often 60–80%), so "
         "cross-check a Gordon-growth result against the implied exit multiple and vice versa."),
        (_c(r"\blevered\b|\bfcfe\b"), "A levered DCF discounts free cash flow to equity (after interest and "
         "debt flows) at the cost of equity and gives equity value directly; an unlevered DCF discounts "
         "FCFF at WACC and gives enterprise value."),
        (_c(r"mid-?year"), "The mid-year convention discounts each year's cash flow by (t − 0.5) periods "
         "because cash arrives through the year, which slightly raises the value."),
        (_c(r"(when|why).{0,40}(not|wouldn.?t|shouldn.?t)|negative cash|unprofitable"), "A DCF is least "
         "reliable when cash flows are negative or unpredictable (early-stage, deeply cyclical, banks); "
         "lean on comps or sector-specific methods there."),
    ],
    "wacc": [
        (_c(r"\bbeta\b"), "Unlever the peers' observed betas (βu = βL / (1 + (1 − t) × D/E)), take the "
         "median, then relever it at the target's own capital structure."),
        (_c(r"cost of equity|\bcapm\b"), "Cost of equity comes from CAPM: risk-free rate + β × equity risk "
         "premium, plus size or country premia where relevant."),
        (_c(r"\bdebt\b|leverage"), "More debt first lowers WACC because debt is cheaper and tax-deductible, "
         "but beyond some point rising default risk lifts both the cost of debt and the cost of equity, "
         "so WACC rises again."),
        (_c(r"private compan"), "For a private company, borrow betas and a target capital structure from "
         "public comparables, since there is no observed beta or market value of equity."),
    ],
    "ev_bridge": [
        (_c(r"\bcash\b"), "Cash is subtracted because it is a non-operating asset an acquirer effectively "
         "gets back, offsetting the debt it assumes."),
        (_c(r"minority|non-?controlling|\bnci\b"), "Non-controlling interest is added because the parent "
         "consolidates 100% of the subsidiary's EBITDA; adding NCI keeps EV consistent with that metric."),
        (_c(r"preferred"), "Preferred stock is added because it is a senior, debt-like claim that must be "
         "repaid or converted before common shareholders are paid."),
        (_c(r"negative"), "Enterprise value can be negative when cash exceeds equity value plus debt — "
         "usually a company the market expects to burn cash."),
        (_c(r"diluted|treasury stock"), "Use diluted shares via the treasury stock method: in-the-money "
         "options add shares, less the shares repurchased with the exercise proceeds."),
        (_c(r"difference|versus|\bvs\.?\b"), "Equity value is what belongs to common shareholders; enterprise "
         "value is the value of the core operations to all capital providers."),
    ],
    "three_statements": [
        (_c(r"goodwill"), "Goodwill is the purchase price minus the fair value of identifiable net assets; it "
         "is not amortised under US GAAP or IFRS but is tested for impairment at least annually."),
        (_c(r"deferred tax"), "A deferred tax liability arises when book taxes exceed cash taxes today (e.g. "
         "accelerated tax depreciation) and reverses later; a deferred tax asset is the opposite (e.g. NOLs)."),
        (_c(r"deferred revenue"), "Deferred revenue is cash collected before the service is delivered: a "
         "liability that turns into revenue as it is earned, so growth in it boosts operating cash flow."),
        (_c(r"only (one|1)|most important|which statement"), "If you could use only one statement, pick the "
         "cash flow statement: it shows the cash the business actually generates, and much of the others can "
         "be reconstructed from it."),
        (_c(r"\bcapex\b|capital expenditure|pp&e"), "CapEx has no immediate income-statement effect: cash falls "
         "in investing activities and PP&E rises by the same amount; depreciation follows in later periods."),
        (_c(r"negative (shareholders.? )?equity"), "Negative shareholders' equity can come from leveraged recaps "
         "or large dividends, buybacks or accumulated losses — it is not automatically a sign of distress."),
        (_c(r"write-?(down|off)|impairment"), "A write-down is a non-cash charge: it reduces the asset and "
         "pre-tax income; if it is tax-deductible, cash rises by the tax saving."),
        (_c(r"depreciation"), "Depreciation is a non-cash expense: it lowers net income by the after-tax "
         "amount, is added back on the cash flow statement, and reduces PP&E on the balance sheet."),
    ],
    "lbo": [
        (_c(r"why .{0,30}(debt|leverage)|leverage .{0,20}(return|irr)"), "Debt amplifies returns because the "
         "sponsor writes a smaller equity cheque while the company's cash flows repay the debt, so equity "
         "captures the full change in enterprise value."),
        (_c(r"good (lbo )?candidate|ideal|attractive (lbo|target)"), "A good LBO candidate has stable, "
         "predictable cash flows, low capex needs, a defensible market position, strong management and room "
         "for operational improvement — bought at a sensible price."),
        (_c(r"returns?|drivers|levers"), "LBO returns come from three levers: EBITDA growth, multiple "
         "expansion, and debt paydown (plus any dividends or recaps)."),
        (_c(r"dividend recap"), "A dividend recap adds debt to fund a distribution to the sponsor, lifting "
         "IRR by returning cash early at the cost of higher leverage and risk."),
    ],
    "moic_irr": [
        (_c(r"rule of thumb|approximate|quick"), "Rules of thumb: 2x in 3 years ≈ 26% IRR, 2x in 5 years ≈ "
         "15%, and 3x in 5 years ≈ 25%."),
        (_c(r"difference|versus|\bvs\.?\b|both"), "MOIC ignores time while IRR ignores scale: a quick 1.5x can "
         "post a higher IRR than a slow 3x, so sponsors look at both."),
    ],
    "accretion_dilution": [
        (_c(r"stock"), "In an all-stock deal, compare P/E ratios: if the acquirer's P/E is higher than the P/E "
         "paid for the target, the deal is accretive before synergies."),
        (_c(r"\bcash\b|\bdebt\b"), "For cash or debt, compare the target's earnings yield (1 ÷ P/E paid) with "
         "the after-tax cost of the cash or debt: if the yield is higher, the deal is accretive."),
        (_c(r"value|still|good deal|bad deal"), "EPS accretion is not value creation: an accretive deal can "
         "still overpay relative to the target's intrinsic value."),
        (_c(r"synerg"), "Treat revenue synergies more sceptically than cost synergies, tax-effect both, and "
         "include integration costs."),
        (_c(r"sensitiv|variables"), "Key sensitivities are purchase premium, financing mix (cash/debt/stock), "
         "interest rate on new debt, synergies, and the acquirer's share price."),
    ],
    "comps_precedents": [
        (_c(r"higher|premium|which"), "Precedent transactions usually give the higher values because they "
         "embed control premiums and expected synergies."),
        (_c(r"select|choose|pick|criteria"), "Choose peers by industry, business model, size, growth, "
         "margins and geography, then prune outliers."),
    ],
    "valuation_multiples": [
        (_c(r"\bp\s*/\s*e\b|price.to.earnings"), "P/E = share price ÷ EPS (equity value ÷ net income); it is "
         "affected by leverage and non-operating items, so compare companies on a consistent basis."),
        (_c(r"revenue"), "EV/Revenue is used when EBITDA is negative or not meaningful, e.g. early-stage or "
         "high-growth companies."),
        (_c(r"higher|trade at|premium|why"), "Higher multiples reflect higher expected growth, lower risk or "
         "higher returns on capital — the same drivers as in a DCF."),
        (_c(r"ebitda.{0,40}(flaw|problem|misleading|not)|(flaw|problem).{0,30}ebitda"), "EBITDA ignores capex, "
         "working capital, taxes and interest, so it can flatter capital-intensive or indebted businesses."),
        (_c(r"vending|lease|own"), "Owning the assets (and depreciating them) versus leasing them changes "
         "EBITDA: lease costs sit above EBITDA while depreciation sits below it, so an owner reports higher "
         "EBITDA and may deserve a lower EV/EBITDA multiple for the same cash economics."),
    ],
    "working_capital": [
        (_c(r"negative"), "Negative working capital means operating current liabilities exceed operating "
         "current assets — common and often healthy where customers pay before suppliers are paid "
         "(retailers, subscriptions), but a warning sign if it comes from stretched payables in a cash crunch."),
        (_c(r"change|increase|decrease|cash flow"), "An increase in NWC is a use of cash (subtracted on the "
         "cash flow statement); a decrease is a source of cash."),
        (_c(r"cash conversion|\bdso\b|days"), "The cash conversion cycle = DSO + DIO − DPO: the days between "
         "paying suppliers and collecting from customers."),
        (_c(r"what is|define|mean"), "Working capital is current assets minus current liabilities; in "
         "valuation we use the operating version that excludes cash and debt."),
    ],
    "debt_credit": [
        (_c(r"incurrence"), "Incurrence covenants restrict specific actions — raising more debt, paying "
         "dividends, selling assets — only when the company takes that action; they are typical of "
         "high-yield bonds."),
        (_c(r"maintenance"), "Maintenance covenants must be met every period (e.g. a maximum leverage ratio or "
         "minimum interest coverage), typical of bank loans; a breach is a default even without any new action."),
        (_c(r"\bpik\b"), "PIK interest accrues to principal instead of being paid in cash, preserving cash flow "
         "but compounding the debt balance and eating into exit equity."),
        (_c(r"senior|subordinat|seniority|priority"), "Seniority sets who is repaid first: senior secured bank "
         "debt, then senior unsecured notes, then subordinated / mezzanine debt, then preferred and common equity."),
        (_c(r"bond.{0,40}loan|loan.{0,40}bond|difference"), "Loans are usually secured, floating-rate, "
         "prepayable and covenant-heavy; bonds are usually unsecured, fixed-rate, longer-dated, with call "
         "protection and lighter incurrence covenants."),
        (_c(r"what does it tell|tell us"), "Covenant headroom and leverage tell you how much financial "
         "flexibility the company has before lenders can intervene."),
    ],
    "pe_fund": [
        (_c(r"waterfall"), "A distribution waterfall pays LPs their capital back first, then the preferred "
         "return, then a GP catch-up, then splits profits 80/20."),
        (_c(r"carr(y|ied)"), "Carried interest is the GP's share of fund profits (typically 20%), paid only "
         "once LPs have their capital and preferred return back."),
        (_c(r"management fee"), "The management fee (about 1.5–2% of commitments during the investment period, "
         "often stepping down later) covers the GP's operating costs."),
        (_c(r"\bdpi\b|\btvpi\b"), "DPI measures cash actually returned per dollar paid in; TVPI adds the "
         "remaining unrealised value, so DPI is the harder, realised measure."),
        (_c(r"hurdle|preferred return"), "The hurdle (preferred return, often 8%) is the minimum annual return "
         "LPs receive before the GP earns carry."),
    ],
    "valuation_overview": [
        (_c(r"highest|lowest|which method"), "Precedents usually give the highest values (control premium), "
         "LBO analysis often the lowest (a floor set by sponsor returns), with comps and the DCF in between "
         "depending on assumptions."),
        (_c(r"\bbank|financial institution|insur"), "Banks and insurers are valued on equity metrics (P/E, "
         "P/TBV) and dividend discount models, because debt is part of their operations."),
        (_c(r"negative|unprofitable|startup|early.stage"), "For unprofitable companies use revenue or "
         "operating-metric multiples, or a DCF far enough out that cash flows turn positive."),
        (_c(r"private compan"), "For a private company, apply public comps and precedents with an "
         "illiquidity discount and build a DCF from management's projections."),
    ],
    "ma_process": [
        (_c(r"buy-?side.{0,60}sell-?side|sell-?side.{0,60}buy-?side"), "Sell-side bankers represent the "
         "seller and aim to maximise price and certainty; buy-side bankers represent the acquirer and aim to "
         "find, value and win targets without overpaying. (In markets, 'sell-side' also means the banks, "
         "versus 'buy-side' investors.)"),
        (_c(r"(stock|asset) purchase"), "In a stock purchase the buyer acquires the shares and all liabilities; "
         "in an asset purchase it picks specific assets and liabilities and gets a tax-basis step-up. Sellers "
         "usually prefer stock sales (one layer of tax, clean exit); buyers prefer asset deals (step-up, fewer "
         "liabilities)."),
        (_c(r"pitch ?book"), "A pitch book covers the bank's credentials, a situation overview, valuation "
         "perspectives (comps, precedents, DCF, LBO), potential buyers or targets, and process recommendations."),
        (_c(r"\bipo\b"), "In an IPO the bank runs due diligence, drafts the registration statement, sets a "
         "price range, markets the deal on a roadshow, builds the order book and prices and allocates shares."),
        (_c(r"fairness"), "A fairness opinion is the bank's view, for the board, that the price is fair from a "
         "financial point of view — backed by the valuation work."),
        (_c(r"what (do )?(investment )?bankers|what does an investment bank"), "Investment bankers advise "
         "companies on M&A and raise debt and equity capital, doing the modelling, materials, marketing and "
         "execution that get transactions done."),
    ],
    "pe_overview": [
        (_c(r"analyst|associate|role|responsibilit|day to day"), "A private equity analyst or associate "
         "screens opportunities, builds LBO and operating models, runs diligence workstreams with advisers, "
         "drafts investment committee memos and supports portfolio companies after the deal closes."),
        (_c(r"differ|versus|\bvs\.?\b|other forms"), "Compared with public-equity or hedge-fund investing, PE "
         "owns control or large stakes in private companies for years, uses leverage and drives operational "
         "change; compared with venture capital it backs mature, cash-generative businesses rather than "
         "early-stage growth."),
        (_c(r"due diligence|diligence"), "PE due diligence covers commercial (market, customers, competition), "
         "financial (quality of earnings, working capital, net debt), legal, tax, IT and management "
         "workstreams, run with advisers, and it feeds directly into price, structure and the 100-day plan."),
        (_c(r"trend|landscape"), "Key private equity themes to follow: fundraising and dry powder, exit "
         "activity (sales, IPOs, continuation funds), financing conditions and private credit, and sector "
         "focus such as software, healthcare and services roll-ups."),
    ],
    "investment_thesis": [
        (_c(r"admire"), "Pick a company whose strategy you can explain in detail — why it wins with customers, "
         "how it converts that into strong economics, and what could threaten it."),
    ],
    "restructuring": [
        (_c(r"liquidation"), "A liquidation valuation marks assets at what a quick sale would recover (high "
         "percentages for cash and receivables, low for inventory and PP&E) and distributes the proceeds by "
         "priority — which is why book shareholders' equity is not the answer."),
        (_c(r"fulcrum"), "The fulcrum security is the most senior class that is not fully covered by the "
         "company's value; it usually converts into the reorganised equity."),
        (_c(r"sides|debtor|creditor"), "Restructuring bankers advise either the debtor (the company) or "
         "creditors (often an ad hoc group or committee of lenders or bondholders)."),
        (_c(r"chapter (7|11)"), "Chapter 11 reorganises the company as a going concern under court protection; "
         "Chapter 7 liquidates it."),
    ],
    "behavioural": [
        (_c(r"why .{0,40}(private equity|\bpe\b|buy-?side|invest)"), "Explain what draws you to investing rather "
         "than advising — owning outcomes, judging businesses as an investor and working with management on "
         "value creation — and back it with deal experience and a view on the firm's strategy."),
        (_c(r"why .{0,40}(ib|investment banking|banking|capital markets|m&a)\b"), "Give two or three specific, "
         "personal reasons (deal exposure, a steep learning curve, working on high-stakes transactions), back "
         "each with evidence from your experience, and connect them to the role and your longer-term goal."),
        (_c(r"why (are|is) (we|us|our)|first choice|why (this|our) (firm|bank|fund|team)|why .{0,30}(goldman|"
            r"morgan stanley|jpmorgan|evercore|lazard|blackstone|kkr)"), "Show you know this firm "
         "specifically — its deal flow, sector or product strengths, culture and the people you have spoken "
         "to — and link two or three of those to your own goals; avoid points that apply to any bank."),
        (_c(r"tell me about yourself|walk me through your (resume|cv|background)"), "Keep it to about 90 "
         "seconds: where you started, the two or three experiences that led you to finance and what each "
         "taught you, and why this role is the logical next step."),
        (_c(r"weakness"), "Pick a real but non-fatal weakness, give a concrete example, then explain the "
         "specific steps you are taking to improve and the evidence that it is working."),
        (_c(r"strength"), "Choose one or two strengths relevant to the role and prove each with a short "
         "example and a result."),
        (_c(r"fail|mistake|misspell|error"), "Pick a genuine failure you owned: what went wrong and your part "
         "in it, how you recovered, and the lasting change in how you work."),
        (_c(r"\bteam|conflict|disagree"), "Describe a specific team situation, your role, how you handled "
         "disagreement or under-performance constructively, and the outcome for the team."),
        (_c(r"lead"), "Show leadership through a specific moment where you set direction, got others to buy "
         "in and delivered a result — titles matter less than influence."),
        (_c(r"where else|interviewing|other (banks|firms|options)"), "Be honest but consistent: name a focused "
         "set of comparable roles that fits a coherent story, and make clear why this firm is a top choice."),
        (_c(r"hours|lifestyle"), "Show realistic expectations: acknowledge long, unpredictable hours, explain "
         "why you are prepared for them — citing demanding experiences you have handled — and what you gain."),
        (_c(r"long.term|future|career goal|(5|five|10|ten) years|plan"), "Give a credible trajectory tied to "
         "the role — build a technical and deal foundation, then take on more client and deal responsibility "
         "— without signalling that you plan to leave straight away."),
        (_c(r"attend|school|university|major|transfer"), "Explain your education choices briefly and "
         "positively, highlighting what you learned and how it prepared you for finance."),
        (_c(r"stay (up.to.date|updated|informed|current)|trends"), "Name specific, credible sources and "
         "habits (e.g. daily financial press, deal newsletters, company filings and earnings calls), then "
         "prove it by discussing one recent deal or market development and your view on it."),
        (_c(r"have you (ever )?worked|experience|details"), "Answer directly and concretely: describe the "
         "relevant role or project, what you personally did, the result, and what it taught you that "
         "applies to this job — if you lack direct experience, point to the closest transferable example."),
    ],
}


def _apply_facets(topic_key: str, question: CanonicalQuestion, answer: Answer) -> Answer:
    wording = question.canonical_wording or ""
    matched = [text for pat, text in _FACETS.get(topic_key, []) if pat.search(wording)][:2]
    if not matched:
        return answer
    concise = f"{matched[0]} {answer.concise_answer}"
    expanded = " ".join(matched) + " " + answer.expanded_explanation
    return answer.model_copy(
        update={
            "concise_answer": concise,
            "expanded_explanation": expanded,
            "confidence": min(0.75, answer.confidence + 0.05),
        }
    )


_AMOUNT_RE = re.compile(r"\$\s?(\d+(?:\.\d+)?)\s*(m|mm|million|bn|billion|k)?", re.IGNORECASE)
_TAX_RE = re.compile(r"(\d{1,2}(?:\.\d+)?)\s?%\s*(?:tax|effective|marginal)?", re.IGNORECASE)


def _parse_amount_and_tax(
    wording: str, *, default_amount: float, default_tax: float
) -> tuple[float, float]:
    amount = default_amount
    tax = default_tax
    m = _AMOUNT_RE.search(wording or "")
    if m:
        try:
            amount = float(m.group(1))
        except ValueError:
            amount = default_amount
    t = _TAX_RE.search(wording or "")
    if t and re.search(r"tax", wording or "", re.IGNORECASE):
        try:
            rate = float(t.group(1)) / 100.0
            if 0 <= rate < 1:
                tax = rate
        except ValueError:
            tax = default_tax
    try:
        depreciation_flow(amount=amount, tax_rate=tax)
    except CalculatorError:
        return default_amount, default_tax
    return amount, tax


def _fmt(value: float) -> str:
    return f"{value:,.2f}".rstrip("0").rstrip(".")
