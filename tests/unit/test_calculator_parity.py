"""KD-3 parity: fixtures/finance/*.json pin calculators.py and packages/domain.

The TypeScript twin (packages/domain/src/finance/calculators.test.ts) runs the
same fixture files through `runTopic`, so a change to either implementation
that moves a number fails one side. Topics that only exist in TypeScript
(drill-only calculators) are marked ``"ts_only": true`` and are checked here
against a small independent reference so their expected values are still
pinned by two implementations.
"""

from __future__ import annotations

import json
import statistics
from pathlib import Path

import pytest

from ibpe_corpus.answers.calculators import CalculatorError, run_topic

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "finance"

PYTHON_TOPICS = {
    "wacc",
    "moic_irr",
    "ev_bridge",
    "lbo",
    "paper_lbo",
    "accretion_dilution",
    "ufcf",
}
# Must match TS_ONLY_TOPICS in packages/domain/src/finance/run-topic.ts.
TS_ONLY_TOPICS = {"three_statement_da", "nwc", "comps", "irr_cashflows"}


def _fixtures() -> list[Path]:
    return sorted(FIXTURES.glob("*.json"))


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _npv(rate: float, cashflows: list[float]) -> float:
    return sum(cf / (1.0 + rate) ** t for t, cf in enumerate(cashflows))


def _irr(cashflows: list[float]) -> float:
    lo, hi = -0.99, 10.0
    f_lo = _npv(lo, cashflows)
    for _ in range(200):
        mid = (lo + hi) / 2
        f_mid = _npv(mid, cashflows)
        if f_lo * f_mid < 0:
            hi = mid
        else:
            lo, f_lo = mid, f_mid
    return (lo + hi) / 2


def _reference_ts_only(topic: str, inputs: dict) -> dict[str, float]:
    """Independent reference for TS-only drill calculators."""
    if topic == "three_statement_da":
        x = float(inputs["da_change"])
        t = float(inputs["tax_rate"])
        ni = -x * (1 - t)
        cash = x * t
        return {
            "pretax_income_change": -x,
            "tax_change": -x * t,
            "net_income_change": ni,
            "cfo_change": cash,
            "cash_change": cash,
            "ppe_change": -x,
            "total_assets_change": cash - x,
            "retained_earnings_change": ni,
            "liabilities_equity_change": ni,
            "balanced": 1.0 if abs((cash - x) - ni) < 1e-9 else 0.0,
        }
    if topic == "nwc":

        def side(suffix: str) -> float:
            return (
                float(inputs[f"receivables_{suffix}"])
                + float(inputs[f"inventory_{suffix}"])
                + float(inputs.get(f"other_current_assets_{suffix}") or 0.0)
                - float(inputs[f"payables_{suffix}"])
                - float(inputs.get(f"accrued_liabilities_{suffix}") or 0.0)
            )

        begin, end = side("begin"), side("end")
        return {
            "nwc_begin": begin,
            "nwc_end": end,
            "delta_nwc": end - begin,
            "cash_impact": begin - end,
        }
    if topic == "comps":
        multiples = [float(m) for m in inputs["multiples"]]
        med = statistics.median(multiples)
        ev = float(inputs["metric"]) * med
        equity = ev - float(inputs.get("net_debt") or 0.0)
        out = {
            "median_multiple": med,
            "mean_multiple": statistics.fmean(multiples),
            "implied_ev": ev,
            "implied_equity": equity,
        }
        if inputs.get("shares") is not None:
            out["implied_share_price"] = equity / float(inputs["shares"])
        return out
    if topic == "irr_cashflows":
        return {"irr": _irr([float(c) for c in inputs["cashflows"]])}
    raise AssertionError(f"no reference for {topic}")


def test_fixture_set_is_nonempty_and_known():
    paths = _fixtures()
    assert len(paths) >= 10
    for path in paths:
        fx = _load(path)
        assert fx["topic"] in PYTHON_TOPICS | TS_ONLY_TOPICS, path.name
        assert bool(fx.get("ts_only")) == (fx["topic"] in TS_ONLY_TOPICS), path.name


@pytest.mark.parametrize("path", _fixtures(), ids=lambda p: p.name)
def test_fixture_matches_python(path: Path):
    fx = _load(path)
    topic = fx["topic"]
    if topic in TS_ONLY_TOPICS:
        with pytest.raises(CalculatorError):
            run_topic(topic, fx["inputs"])
        got = _reference_ts_only(topic, fx["inputs"])
    else:
        got = run_topic(topic, fx["inputs"])
    for key, expected in fx["expected"].items():
        assert key in got, f"{path.name}: missing {key}"
        assert abs(got[key] - expected) < 1e-6, f"{path.name}:{key} {got[key]} != {expected}"
