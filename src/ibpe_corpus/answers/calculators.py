"""Deterministic finance calculators (no LLM).

Used by validators and fixtures. Pure functions — identical inputs → identical outputs.
"""

from __future__ import annotations

from typing import Any


class CalculatorError(ValueError):
    """Invalid or incomplete calculator inputs."""


def wacc(
    *,
    equity_weight: float,
    cost_of_equity: float,
    debt_weight: float,
    cost_of_debt: float,
    tax_rate: float,
) -> float:
    """After-tax WACC = E/V·Re + D/V·Rd·(1−t)."""
    if tax_rate < 0 or tax_rate >= 1:
        raise CalculatorError(f"tax_rate out of range: {tax_rate}")
    return equity_weight * cost_of_equity + debt_weight * cost_of_debt * (1.0 - tax_rate)


def moic(*, entry_equity: float, exit_equity: float) -> float:
    if entry_equity == 0:
        raise CalculatorError("entry_equity must be non-zero")
    return exit_equity / entry_equity


def irr_approx(*, entry_equity: float, exit_equity: float, years: float) -> float:
    """Compound IRR approximation from MOIC and hold period."""
    if years <= 0:
        raise CalculatorError("years must be positive")
    multiple = moic(entry_equity=entry_equity, exit_equity=exit_equity)
    if multiple < 0:
        raise CalculatorError("MOIC must be non-negative for IRR approx")
    return multiple ** (1.0 / years) - 1.0


def ev_bridge(
    *,
    equity_value: float,
    gross_debt: float,
    cash: float,
    preferred: float = 0.0,
    nci: float = 0.0,
) -> dict[str, float]:
    """Enterprise value bridge: EV = equity + net debt + preferred + NCI."""
    net_debt = gross_debt - cash
    enterprise_value = equity_value + net_debt + preferred + nci
    return {
        "net_debt": net_debt,
        "enterprise_value": enterprise_value,
    }


def lbo_exit_equity(
    *,
    ebitda_exit: float | None = None,
    exit_multiple: float | None = None,
    net_debt_exit: float | None = None,
    sponsor_equity: float,
    exit_equity: float | None = None,
) -> dict[str, float]:
    """Exit equity and MOIC for a simple paper-LBO style bridge."""
    if exit_equity is not None:
        eq = float(exit_equity)
    else:
        if ebitda_exit is None or exit_multiple is None or net_debt_exit is None:
            raise CalculatorError(
                "Provide exit_equity or (ebitda_exit, exit_multiple, net_debt_exit)"
            )
        eq = float(ebitda_exit) * float(exit_multiple) - float(net_debt_exit)
    if sponsor_equity == 0:
        raise CalculatorError("sponsor_equity must be non-zero")
    return {"exit_equity": eq, "moic": eq / sponsor_equity}


def accretion_dilution(
    *,
    acquirer_eps: float,
    combined_eps: float,
) -> dict[str, float]:
    """Simple accretion/(dilution) = combined EPS / stand-alone − 1."""
    if acquirer_eps == 0:
        raise CalculatorError("acquirer_eps must be non-zero")
    delta = combined_eps / acquirer_eps - 1.0
    return {
        "eps_delta": delta,
        "accretive": 1.0 if delta > 0 else 0.0,
    }


def ufcf(
    *,
    ebit: float,
    tax_rate: float,
    da: float = 0.0,
    capex: float = 0.0,
    delta_nwc: float = 0.0,
) -> float:
    """Unlevered FCF ≈ EBIT(1−t) + D&A − CapEx − ΔNWC."""
    return ebit * (1.0 - tax_rate) + da - capex - delta_nwc


def run_topic(topic: str, inputs: dict[str, Any]) -> dict[str, float]:
    """Dispatch calculator by topic key used in answer calculation_representation."""
    t = (topic or "").strip().lower()
    if t == "wacc":
        return {"wacc": wacc(**{k: float(inputs[k]) for k in (
            "equity_weight", "cost_of_equity", "debt_weight", "cost_of_debt", "tax_rate"
        )})}
    if t == "moic_irr":
        entry = float(inputs["entry_equity"])
        exit_ = float(inputs["exit_equity"])
        years = float(inputs["years"])
        return {
            "moic": moic(entry_equity=entry, exit_equity=exit_),
            "irr_approx": irr_approx(entry_equity=entry, exit_equity=exit_, years=years),
        }
    if t == "ev_bridge":
        return ev_bridge(
            equity_value=float(inputs["equity_value"]),
            gross_debt=float(inputs["gross_debt"]),
            cash=float(inputs["cash"]),
            preferred=float(inputs.get("preferred") or 0.0),
            nci=float(inputs.get("nci") or 0.0),
        )
    if t in {"lbo", "paper_lbo"}:
        kwargs: dict[str, Any] = {"sponsor_equity": float(inputs["sponsor_equity"])}
        if "exit_equity" in inputs:
            kwargs["exit_equity"] = float(inputs["exit_equity"])
        else:
            kwargs["ebitda_exit"] = float(inputs["ebitda_exit"])
            kwargs["exit_multiple"] = float(inputs["exit_multiple"])
            kwargs["net_debt_exit"] = float(inputs["net_debt_exit"])
        return lbo_exit_equity(**kwargs)
    if t == "accretion_dilution":
        return accretion_dilution(
            acquirer_eps=float(inputs["acquirer_eps"]),
            combined_eps=float(inputs["combined_eps"]),
        )
    if t == "ufcf":
        return {
            "ufcf": ufcf(
                ebit=float(inputs["ebit"]),
                tax_rate=float(inputs["tax_rate"]),
                da=float(inputs.get("da") or 0.0),
                capex=float(inputs.get("capex") or 0.0),
                delta_nwc=float(inputs.get("delta_nwc") or 0.0),
            )
        }
    raise CalculatorError(f"Unknown calculator topic: {topic!r}")
