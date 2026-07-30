"""Validators for synthesised (and other) answers.

Updates ``validation_status`` and provenance:
``synthesised_validated`` | ``needs_review`` | ``rejected``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ibpe_corpus import VALIDATOR_VERSION
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    ValidationStatus,
)

_REL_TOL = 1e-3
_ABS_TOL = 1e-6

_ASSUMPTION_FLAGS = (
    ("tax_rate", ("tax rate", "tax_rate", "after-tax", "after tax", "(1−t)", "(1-t)", "tc")),
    ("leases", ("lease", "ifrs 16", "operating lease", "capitalised lease")),
    ("sbc", ("sbc", "stock-based compensation", "share-based")),
    ("nci", ("nci", "noncontrolling", "non-controlling", "minority interest")),
    ("terminal_growth", ("terminal growth", "gordon growth", "perpetuity growth")),
    ("exit_multiple", ("exit multiple", "exit ev")),
)


@dataclass
class ValidatorResult:
    name: str
    status: ValidationStatus
    notes: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)


def technical_finance_validator(answer: Answer) -> ValidatorResult:
    """Keyword/structure checks that mentioned formulas appear coherent."""
    notes: list[str] = []
    calc = answer.calculation_representation or {}
    topic = str(calc.get("topic") or "")
    blob = " ".join(
        [
            answer.concise_answer,
            answer.expanded_explanation,
            str(calc.get("formula") or ""),
        ]
    ).lower()

    required: dict[str, tuple[str, ...]] = {
        "wacc": ("wacc", "cost of equity", "cost of debt"),
        "dcf": ("cash flow", "discount", "terminal"),
        "ev_bridge": ("enterprise", "equity", "debt"),
        "lbo": ("debt", "equity", "exit"),
        "paper_lbo": ("debt", "equity", "exit"),
        "moic_irr": ("moic", "irr"),
        "accretion_dilution": ("eps", "accret"),
        "three_statements": ("income", "cash", "balance"),
    }

    keys = required.get(topic)
    if keys:
        missing = [k for k in keys if k not in blob]
        if missing:
            notes.append(f"Missing expected technical cues for {topic}: {missing}")
            return ValidatorResult(
                "technical_finance_validator",
                ValidationStatus.NEEDS_CORRECTION,
                notes=notes,
            )

    if not answer.concise_answer.strip() or not answer.expanded_explanation.strip():
        notes.append("Empty concise or expanded explanation")
        return ValidatorResult(
            "technical_finance_validator", ValidationStatus.REJECT, notes=notes
        )

    if calc.get("formula") or topic in required:
        notes.append("Technical structure looks coherent")
        return ValidatorResult(
            "technical_finance_validator", ValidationStatus.PASS, notes=notes
        )

    notes.append("No structured formula; soft pass")
    return ValidatorResult(
        "technical_finance_validator", ValidationStatus.PASS_WITH_ASSUMPTIONS, notes=notes
    )


def numerical_validator(answer: Answer) -> ValidatorResult:
    """Executable checks for WACC, MOIC, IRR approx, EV bridge, simple LBO exit equity."""
    calc = answer.calculation_representation or {}
    topic = str(calc.get("topic") or "")
    inputs = dict(calc.get("inputs") or {})
    expected = dict(calc.get("expected") or {})
    notes: list[str] = []

    if topic not in {
        "wacc",
        "moic_irr",
        "ev_bridge",
        "lbo",
        "paper_lbo",
    }:
        return ValidatorResult(
            "numerical_validator",
            ValidationStatus.PASS_WITH_ASSUMPTIONS,
            notes=["No numerical topic to execute"],
        )

    try:
        if topic == "wacc":
            got = _calc_wacc(inputs)
            exp = float(expected.get("wacc", got))
            if not _close(got, exp):
                notes.append(f"WACC mismatch: got {got}, expected {exp}")
                return ValidatorResult(
                    "numerical_validator", ValidationStatus.REJECT, notes=notes
                )
            notes.append(f"WACC check passed ({got})")

        elif topic == "moic_irr":
            moic = _calc_moic(inputs)
            irr = _calc_irr_approx(inputs)
            exp_moic = float(expected.get("moic", moic))
            exp_irr = float(expected.get("irr_approx", irr))
            if not _close(moic, exp_moic):
                notes.append(f"MOIC mismatch: got {moic}, expected {exp_moic}")
                return ValidatorResult(
                    "numerical_validator", ValidationStatus.REJECT, notes=notes
                )
            if not _close(irr, exp_irr, rel=1e-3, abs_=1e-4):
                notes.append(f"IRR approx mismatch: got {irr}, expected {exp_irr}")
                return ValidatorResult(
                    "numerical_validator", ValidationStatus.REJECT, notes=notes
                )
            notes.append(f"MOIC/IRR checks passed (MOIC={moic}, IRR≈{irr})")

        elif topic == "ev_bridge":
            net_debt, ev = _calc_ev_bridge(inputs)
            exp_nd = float(expected.get("net_debt", net_debt))
            exp_ev = float(expected.get("enterprise_value", ev))
            if not _close(net_debt, exp_nd) or not _close(ev, exp_ev):
                notes.append(
                    f"EV bridge mismatch: net_debt={net_debt}/{exp_nd}, EV={ev}/{exp_ev}"
                )
                return ValidatorResult(
                    "numerical_validator", ValidationStatus.REJECT, notes=notes
                )
            # Identity: EV = equity + net debt (+ preferred + nci)
            equity = float(inputs["equity_value"])
            preferred = float(inputs.get("preferred") or 0.0)
            nci = float(inputs.get("nci") or 0.0)
            if not _close(ev, equity + net_debt + preferred + nci):
                notes.append("EV ≠ equity + net debt identity failed")
                return ValidatorResult(
                    "numerical_validator", ValidationStatus.REJECT, notes=notes
                )
            notes.append(f"EV bridge passed (EV={ev})")

        elif topic in {"lbo", "paper_lbo"}:
            exit_equity, moic = _calc_lbo_exit(inputs)
            exp_eq = float(expected.get("exit_equity", exit_equity))
            exp_moic = float(expected.get("moic", moic))
            if not _close(exit_equity, exp_eq) or not _close(moic, exp_moic):
                notes.append(
                    f"LBO exit mismatch: equity={exit_equity}/{exp_eq}, moic={moic}/{exp_moic}"
                )
                return ValidatorResult(
                    "numerical_validator", ValidationStatus.REJECT, notes=notes
                )
            notes.append(f"LBO exit equity/MOIC passed ({exit_equity}, {moic})")

    except (KeyError, TypeError, ValueError, ZeroDivisionError) as exc:
        return ValidatorResult(
            "numerical_validator",
            ValidationStatus.NEEDS_CORRECTION,
            notes=[f"Numerical inputs incomplete: {exc}"],
        )

    return ValidatorResult(
        "numerical_validator", ValidationStatus.PASS, notes=notes
    )


def assumption_validator(answer: Answer) -> ValidatorResult:
    """Flag tax rate, lease, SBC, and similar modelling dependencies."""
    blob = " ".join(
        [
            answer.concise_answer,
            answer.expanded_explanation,
            " ".join(answer.assumptions),
            str(answer.calculation_representation or {}),
        ]
    ).lower()

    flags: list[str] = []
    for name, cues in _ASSUMPTION_FLAGS:
        if any(cue in blob for cue in cues):
            flags.append(name)

    notes = [f"Assumption dependencies: {flags}"] if flags else ["No major assumption flags"]
    # Presence of flags is informative, not a failure.
    status = (
        ValidationStatus.PASS_WITH_ASSUMPTIONS if flags else ValidationStatus.PASS
    )
    return ValidatorResult(
        "assumption_validator", status=status, notes=notes, flags=flags
    )


def independent_validator(answer: Answer) -> ValidatorResult:
    """Second pass without relying on draft reasoning quality claims.

    Inspects only observable fields (lengths, garbage patterns, calc consistency)
    and returns a ValidationStatus.
    """
    concise = (answer.concise_answer or "").strip()
    expanded = (answer.expanded_explanation or "").strip()

    if not concise or not expanded:
        return ValidatorResult(
            "independent_validator",
            ValidationStatus.REJECT,
            notes=["Empty answer content"],
        )

    if _is_garbage(concise) or _is_garbage(expanded):
        return ValidatorResult(
            "independent_validator",
            ValidationStatus.REJECT,
            notes=["Garbage / placeholder content"],
        )

    if len(concise) < 20 or len(expanded) < 40:
        return ValidatorResult(
            "independent_validator",
            ValidationStatus.NEEDS_CORRECTION,
            notes=["Answer too thin for interview use"],
        )

    calc = answer.calculation_representation
    if isinstance(calc, dict) and calc.get("expected") and calc.get("inputs"):
        # Re-run numerical without trusting prior notes
        num = numerical_validator(answer)
        if num.status == ValidationStatus.REJECT:
            return ValidatorResult(
                "independent_validator",
                ValidationStatus.REJECT,
                notes=["Independent numerical re-check failed"] + num.notes,
            )

    return ValidatorResult(
        "independent_validator",
        ValidationStatus.PASS,
        notes=["Independent structural checks passed"],
    )


def validate_answer(answer: Answer) -> Answer:
    """Run all validators and update provenance / validation_status in place semantics.

    Returns a new Answer instance with updated fields. Source-provided and
    corpus-matched answers are quality-checked but keep their provenance unless
    rejected as empty/garbage.
    """
    results = [
        technical_finance_validator(answer),
        numerical_validator(answer),
        assumption_validator(answer),
        independent_validator(answer),
    ]

    statuses = [r.status for r in results]
    all_flags = [f for r in results for f in r.flags]

    if ValidationStatus.REJECT in statuses:
        final_status = ValidationStatus.REJECT
    elif ValidationStatus.NEEDS_CORRECTION in statuses:
        final_status = ValidationStatus.NEEDS_CORRECTION
    elif ValidationStatus.PASS_WITH_ASSUMPTIONS in statuses:
        final_status = ValidationStatus.PASS_WITH_ASSUMPTIONS
    else:
        final_status = ValidationStatus.PASS

    provenance = answer.provenance_type
    if provenance in {
        AnswerProvenance.SYNTHESISED_UNVALIDATED,
        AnswerProvenance.SYNTHESISED_VALIDATED,
        AnswerProvenance.NEEDS_REVIEW,
    }:
        if final_status == ValidationStatus.PASS:
            provenance = AnswerProvenance.SYNTHESISED_VALIDATED
        elif final_status == ValidationStatus.PASS_WITH_ASSUMPTIONS:
            provenance = AnswerProvenance.SYNTHESISED_VALIDATED
        elif final_status == ValidationStatus.NEEDS_CORRECTION:
            provenance = AnswerProvenance.NEEDS_REVIEW
        else:
            provenance = AnswerProvenance.REJECTED
    elif final_status == ValidationStatus.REJECT:
        # Empty/garbage even if claimed source — do not keep as usable answer.
        provenance = AnswerProvenance.REJECTED

    # Never allow synthesised text to be labelled source_provided.
    if provenance == AnswerProvenance.SOURCE_PROVIDED and answer.generator_version:
        provenance = AnswerProvenance.NEEDS_REVIEW

    assumptions = list(answer.assumptions)
    for flag in all_flags:
        label = f"depends_on:{flag}"
        if label not in assumptions:
            assumptions.append(label)

    return answer.model_copy(
        update={
            "validation_status": final_status,
            "provenance_type": provenance,
            "validator_version": VALIDATOR_VERSION,
            "assumptions": assumptions,
            "confidence": _adjust_confidence(answer.confidence, final_status),
        }
    )


def _adjust_confidence(base: float, status: ValidationStatus) -> float:
    if status == ValidationStatus.PASS:
        return min(0.95, max(base, 0.75))
    if status == ValidationStatus.PASS_WITH_ASSUMPTIONS:
        return min(0.9, max(base, 0.7))
    if status == ValidationStatus.NEEDS_CORRECTION:
        return min(base, 0.45)
    if status == ValidationStatus.REJECT:
        return min(base, 0.1)
    return base


def _close(a: float, b: float, rel: float = _REL_TOL, abs_: float = _ABS_TOL) -> bool:
    return abs(a - b) <= max(abs_, rel * max(abs(a), abs(b), 1e-12))


def _calc_wacc(inputs: dict[str, Any]) -> float:
    e = float(inputs["equity_weight"])
    re = float(inputs["cost_of_equity"])
    d = float(inputs["debt_weight"])
    rd = float(inputs["cost_of_debt"])
    t = float(inputs["tax_rate"])
    return e * re + d * rd * (1.0 - t)


def _calc_moic(inputs: dict[str, Any]) -> float:
    entry = float(inputs["entry_equity"])
    exit_ = float(inputs["exit_equity"])
    return exit_ / entry


def _calc_irr_approx(inputs: dict[str, Any]) -> float:
    moic = _calc_moic(inputs)
    years = float(inputs["years"])
    return moic ** (1.0 / years) - 1.0


def _calc_ev_bridge(inputs: dict[str, Any]) -> tuple[float, float]:
    equity = float(inputs["equity_value"])
    gross_debt = float(inputs["gross_debt"])
    cash = float(inputs["cash"])
    preferred = float(inputs.get("preferred") or 0.0)
    nci = float(inputs.get("nci") or 0.0)
    net_debt = gross_debt - cash
    ev = equity + net_debt + preferred + nci
    return net_debt, ev


def _calc_lbo_exit(inputs: dict[str, Any]) -> tuple[float, float]:
    if "exit_equity" in inputs and "sponsor_equity" in inputs:
        exit_equity = float(inputs["exit_equity"])
        sponsor = float(inputs["sponsor_equity"])
        return exit_equity, exit_equity / sponsor

    ebitda_exit = float(inputs["ebitda_exit"])
    exit_multiple = float(inputs["exit_multiple"])
    net_debt_exit = float(inputs["net_debt_exit"])
    sponsor = float(inputs["sponsor_equity"])
    exit_ev = ebitda_exit * exit_multiple
    exit_equity = exit_ev - net_debt_exit
    return exit_equity, exit_equity / sponsor


def _is_garbage(text: str) -> bool:
    lowered = text.lower().strip()
    if lowered in {"n/a", "na", "none", "test", "todo", "xxx", "...", "tbd", "placeholder"}:
        return True
    if len(set(lowered.replace(" ", ""))) <= 2 and len(lowered) >= 8:
        return True  # e.g. "aaaaaaa" / "!!!!!!!"
    if lowered.startswith("lorem ipsum"):
        return True
    return False
