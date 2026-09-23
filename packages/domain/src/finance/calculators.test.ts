/**
 * KD-3 parity: every fixtures/finance/*.json runs through the TS calculators.
 * tests/unit/test_calculator_parity.py runs the same files through
 * calculators.py, so both implementations are pinned to one set of numbers.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import {
  CalculatorError,
  PYTHON_PARITY_TOPICS,
  TS_ONLY_TOPICS,
  accretionDilution,
  compsImpliedValue,
  daFlowThrough,
  equityFromEv,
  evBridge,
  irr,
  irrApprox,
  lboExitEquity,
  median,
  moic,
  npv,
  runTopic,
  ufcf,
  wacc,
} from "./index.js"

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../../../../fixtures/finance")

type Fixture = {
  fixture_id: string
  topic: string
  ts_only?: boolean
  inputs: Record<string, unknown>
  expected: Record<string, number>
}

function loadFixtures(): Array<[string, Fixture]> {
  return readdirSync(FIXTURES)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => [f, JSON.parse(readFileSync(join(FIXTURES, f), "utf8")) as Fixture])
}

test("fixtures directory has calculator fixtures for every topic family", () => {
  const topics = new Set(loadFixtures().map(([, fx]) => fx.topic))
  for (const t of ["wacc", "moic_irr", "ev_bridge", "ufcf", "accretion_dilution", "three_statement_da", "nwc", "comps", "irr_cashflows"]) {
    assert.ok(topics.has(t), `missing fixture for ${t}`)
  }
  assert.ok(topics.has("paper_lbo") || topics.has("lbo"))
})

for (const [file, fx] of loadFixtures()) {
  test(`fixture parity: ${file}`, () => {
    const known = [...PYTHON_PARITY_TOPICS, ...TS_ONLY_TOPICS] as string[]
    assert.ok(known.includes(fx.topic), `unknown topic ${fx.topic}`)
    assert.equal(
      Boolean(fx.ts_only),
      (TS_ONLY_TOPICS as readonly string[]).includes(fx.topic),
      "ts_only flag must match TS_ONLY_TOPICS",
    )
    const got = runTopic(fx.topic, fx.inputs)
    for (const [key, expected] of Object.entries(fx.expected)) {
      assert.ok(key in got, `${file}: missing ${key}`)
      assert.ok(
        Math.abs((got[key] as number) - expected) < 1e-6,
        `${file}:${key} ${got[key]} != ${expected}`,
      )
    }
  })
}

test("wacc rejects bad tax rates like Python", () => {
  const base = { equity_weight: 0.5, cost_of_equity: 0.1, debt_weight: 0.5, cost_of_debt: 0.05 }
  assert.throws(() => wacc({ ...base, tax_rate: 1.5 }), CalculatorError)
  assert.throws(() => wacc({ ...base, tax_rate: -0.1 }), CalculatorError)
  assert.throws(() => wacc({ ...base, tax_rate: 1 }), CalculatorError)
  assert.ok(Math.abs(wacc({ ...base, tax_rate: 0 }) - 0.075) < 1e-12)
})

test("moic / irr / lbo / accretion error paths mirror calculators.py", () => {
  assert.throws(() => moic({ entry_equity: 0, exit_equity: 1 }), CalculatorError)
  assert.throws(() => irrApprox({ entry_equity: 1, exit_equity: 2, years: 0 }), CalculatorError)
  assert.throws(() => irrApprox({ entry_equity: 1, exit_equity: -2, years: 3 }), CalculatorError)
  assert.throws(() => lboExitEquity({ sponsor_equity: 100 }), CalculatorError)
  assert.throws(() => lboExitEquity({ sponsor_equity: 0, exit_equity: 5 }), CalculatorError)
  assert.throws(() => accretionDilution({ acquirer_eps: 0, combined_eps: 1 }), CalculatorError)
  assert.throws(() => runTopic("nope", {}), CalculatorError)
  assert.throws(() => runTopic("wacc", { equity_weight: 1 }), CalculatorError)
})

test("accretion sign and ufcf identity (matches Python unit tests)", () => {
  const out = accretionDilution({ acquirer_eps: 2.0, combined_eps: 2.2 })
  assert.equal(out.accretive, 1)
  assert.ok(Math.abs(out.eps_delta - 0.1) < 1e-9)
  assert.equal(accretionDilution({ acquirer_eps: 2, combined_eps: 1.9 }).accretive, 0)
  assert.ok(Math.abs(ufcf({ ebit: 100, tax_rate: 0.25, da: 20, capex: 30, delta_nwc: 5 }) - 60) < 1e-9)
})

test("ev bridge round-trips", () => {
  const fwd = evBridge({ equity_value: 1000, gross_debt: 400, cash: 100, preferred: 50, nci: 25 })
  const back = equityFromEv({ enterprise_value: fwd.enterprise_value, gross_debt: 400, cash: 100, preferred: 50, nci: 25 })
  assert.equal(back.equity_value, 1000)
})

test("exact IRR agrees with irrApprox when there are no interim flows", () => {
  const exact = irr([-100, 0, 0, 0, 0, 200])
  const approx = irrApprox({ entry_equity: 100, exit_equity: 200, years: 5 })
  assert.ok(Math.abs(exact - approx) < 1e-9)
  assert.ok(Math.abs(npv(exact, [-100, 0, 0, 0, 0, 200])) < 1e-6)
  assert.throws(() => irr([100, 100]), CalculatorError)
})

test("D&A flow-through balances for any tax rate and sign", () => {
  for (const x of [10, -10, 37.5]) {
    for (const t of [0, 0.21, 0.25, 0.4]) {
      const r = daFlowThrough({ da_change: x, tax_rate: t })
      assert.equal(r.balanced, 1)
      assert.ok(Math.abs(r.cash_change - x * t) < 1e-9)
      assert.ok(Math.abs(r.net_income_change + x * (1 - t)) < 1e-9)
    }
  }
})

test("comps uses the median and handles even peer counts", () => {
  assert.equal(median([8, 12, 9, 10]), 9.5)
  const r = compsImpliedValue({ metric: 50, multiples: [6, 7, 30] })
  assert.equal(r.implied_ev, 350)
  assert.equal(r.implied_share_price, null)
})
