/**
 * Topic dispatcher — the TS twin of `run_topic` in
 * src/ibpe_corpus/answers/calculators.py. Fixtures in fixtures/finance/*.json
 * are run through both so the two implementations stay pinned (KD-3).
 */
import { accretionDilution } from "./accretion.js"
import { compsImpliedValue } from "./comps.js"
import { CalculatorError } from "./errors.js"
import { evBridge } from "./ev-bridge.js"
import { irr, irrApprox } from "./irr.js"
import { lboExitEquity } from "./lbo.js"
import { moic } from "./moic.js"
import { nwcChange } from "./nwc.js"
import { daFlowThrough } from "./three-statement.js"
import { ufcf } from "./ufcf.js"
import { wacc } from "./wacc.js"

/** Topics implemented by both calculators.py and this package. */
export const PYTHON_PARITY_TOPICS = [
  "wacc",
  "moic_irr",
  "ev_bridge",
  "lbo",
  "paper_lbo",
  "accretion_dilution",
  "ufcf",
] as const

/** Topics only in TypeScript (drill-only calculators). */
export const TS_ONLY_TOPICS = ["three_statement_da", "nwc", "comps", "irr_cashflows"] as const

function num(inputs: Record<string, unknown>, key: string): number {
  if (!(key in inputs)) throw new CalculatorError(`missing input: ${key}`)
  const value = Number(inputs[key])
  if (!Number.isFinite(value)) throw new CalculatorError(`non-numeric input: ${key}`)
  return value
}

/** Python `float(inputs.get(key) or 0.0)`. */
function optNum(inputs: Record<string, unknown>, key: string): number {
  const raw = inputs[key]
  if (raw == null || raw === "" || raw === 0) return 0
  return num(inputs, key)
}

function numList(inputs: Record<string, unknown>, key: string): number[] {
  const raw = inputs[key]
  if (!Array.isArray(raw)) throw new CalculatorError(`expected a list: ${key}`)
  return raw.map((v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) throw new CalculatorError(`non-numeric value in ${key}`)
    return n
  })
}

export function runTopic(topic: string, inputs: Record<string, unknown>): Record<string, number> {
  const t = (topic || "").trim().toLowerCase()
  if (t === "wacc") {
    return {
      wacc: wacc({
        equity_weight: num(inputs, "equity_weight"),
        cost_of_equity: num(inputs, "cost_of_equity"),
        debt_weight: num(inputs, "debt_weight"),
        cost_of_debt: num(inputs, "cost_of_debt"),
        tax_rate: num(inputs, "tax_rate"),
      }),
    }
  }
  if (t === "moic_irr") {
    const entry = num(inputs, "entry_equity")
    const exit = num(inputs, "exit_equity")
    const years = num(inputs, "years")
    return {
      moic: moic({ entry_equity: entry, exit_equity: exit }),
      irr_approx: irrApprox({ entry_equity: entry, exit_equity: exit, years }),
    }
  }
  if (t === "ev_bridge") {
    return evBridge({
      equity_value: num(inputs, "equity_value"),
      gross_debt: num(inputs, "gross_debt"),
      cash: num(inputs, "cash"),
      preferred: optNum(inputs, "preferred"),
      nci: optNum(inputs, "nci"),
    })
  }
  if (t === "lbo" || t === "paper_lbo") {
    if ("exit_equity" in inputs) {
      return lboExitEquity({
        sponsor_equity: num(inputs, "sponsor_equity"),
        exit_equity: num(inputs, "exit_equity"),
      })
    }
    return lboExitEquity({
      sponsor_equity: num(inputs, "sponsor_equity"),
      ebitda_exit: num(inputs, "ebitda_exit"),
      exit_multiple: num(inputs, "exit_multiple"),
      net_debt_exit: num(inputs, "net_debt_exit"),
    })
  }
  if (t === "accretion_dilution") {
    return accretionDilution({
      acquirer_eps: num(inputs, "acquirer_eps"),
      combined_eps: num(inputs, "combined_eps"),
    })
  }
  if (t === "ufcf") {
    return {
      ufcf: ufcf({
        ebit: num(inputs, "ebit"),
        tax_rate: num(inputs, "tax_rate"),
        da: optNum(inputs, "da"),
        capex: optNum(inputs, "capex"),
        delta_nwc: optNum(inputs, "delta_nwc"),
      }),
    }
  }
  if (t === "three_statement_da") {
    return {
      ...daFlowThrough({ da_change: num(inputs, "da_change"), tax_rate: num(inputs, "tax_rate") }),
    }
  }
  if (t === "nwc") {
    const side = (suffix: string) => ({
      receivables: num(inputs, `receivables_${suffix}`),
      inventory: num(inputs, `inventory_${suffix}`),
      payables: num(inputs, `payables_${suffix}`),
      other_current_assets: optNum(inputs, `other_current_assets_${suffix}`),
      accrued_liabilities: optNum(inputs, `accrued_liabilities_${suffix}`),
    })
    return nwcChange({ begin: side("begin"), end: side("end") })
  }
  if (t === "comps") {
    const out = compsImpliedValue({
      metric: num(inputs, "metric"),
      multiples: numList(inputs, "multiples"),
      net_debt: optNum(inputs, "net_debt"),
      shares: inputs.shares == null ? null : num(inputs, "shares"),
    })
    const result: Record<string, number> = {
      median_multiple: out.median_multiple,
      mean_multiple: out.mean_multiple,
      implied_ev: out.implied_ev,
      implied_equity: out.implied_equity,
    }
    if (out.implied_share_price != null) result.implied_share_price = out.implied_share_price
    return result
  }
  if (t === "irr_cashflows") {
    return { irr: irr(numList(inputs, "cashflows")) }
  }
  throw new CalculatorError(`Unknown calculator topic: ${JSON.stringify(topic)}`)
}
