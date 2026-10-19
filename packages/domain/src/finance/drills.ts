/**
 * Numeric drill templates (plan 2026-09-23-001 P2.8, KD-3). Pure + seeded:
 * the same (template_id, seed) always yields the same prompt, inputs and
 * answer, so an attempt can be re-graded exactly from its id alone. Every
 * answer comes from the finance calculators in this folder (which are pinned
 * to src/ibpe_corpus/answers/calculators.py by shared fixtures), never an LLM.
 */
import { accretionDilution, proFormaEps } from "./accretion.js"
import { compsImpliedValue } from "./comps.js"
import { equityFromEv, evBridge } from "./ev-bridge.js"
import { fmtMm, fmtNum, fmtPct, fmtSigned, fmtUsd, fmtX } from "./format.js"
import { irr, irrApprox, npv } from "./irr.js"
import { lboExitEquity } from "./lbo.js"
import { moic } from "./moic.js"
import { nwcChange } from "./nwc.js"
import { createRng, roundTo, type Rng } from "./rng.js"
import { daFlowThrough } from "./three-statement.js"
import { ufcf } from "./ufcf.js"
import { capmCostOfEquity, wacc } from "./wacc.js"

export type DrillDifficulty = "easy" | "medium" | "hard"
export type ToleranceKind = "relative" | "absolute"

export type DrillTemplateMeta = {
  id: string
  title: string
  topic: string
  concept_id: string | null
  difficulty: DrillDifficulty
  /** One-line description for the drill picker. */
  description?: string
  /** Answer unit (`%`, `x`, `$mm`, `$`). */
  unit?: string | null
}

export type GeneratedDrill = {
  instance: {
    id: string
    template_id: string
    seed: string
    topic: string
    concept_id: string | null
    difficulty: DrillDifficulty
    prompt: string
    inputs: Record<string, unknown>
    unit: string | null
  }
  solution: {
    answer: number
    unit: string | null
    tolerance: number
    tolerance_kind: ToleranceKind
    explanation: string
  }
}

export type DrillAnswer = {
  answer: number
  unit: string | null
  tolerance: number
  tolerance_kind: ToleranceKind
}

export type DrillTemplate<I extends Record<string, unknown> = Record<string, unknown>> = {
  meta: DrillTemplateMeta
  sample(rng: Rng): I
  prompt(inputs: I): string
  compute(inputs: I): DrillAnswer
  explain(inputs: I): string
}

/* ------------------------------------------------------------------ */
/* Concepts + shared bits                                             */
/* ------------------------------------------------------------------ */

const CONCEPT = {
  accounting: "concept_accounting_foundations",
  ev: "concept_ev_equity_value",
  dcf: "concept_dcf_wacc",
  lbo: "concept_lbo_paper_lbo",
} as const

const TAX_RATES = [0.2, 0.21, 0.25, 0.3] as const

const pctAbs = (answer: number, tolerance: number): DrillAnswer => ({
  answer,
  unit: "%",
  tolerance,
  tolerance_kind: "absolute",
})

const mmRel = (answer: number, tolerance = 0.01): DrillAnswer => ({
  answer,
  unit: "$mm",
  tolerance,
  tolerance_kind: "relative",
})

function steps(lines: string[]): string {
  return lines.map((line, i) => `${i + 1}. ${line}`).join("\n")
}

function define<I extends Record<string, unknown>>(t: DrillTemplate<I>): DrillTemplate {
  return t as unknown as DrillTemplate
}

/* ------------------------------------------------------------------ */
/* WACC                                                               */
/* ------------------------------------------------------------------ */

type WaccWeightsInputs = {
  equity_weight: number
  debt_weight: number
  cost_of_equity: number
  cost_of_debt: number
  tax_rate: number
}

const waccWeights = define<WaccWeightsInputs>({
  meta: {
    id: "wacc_weights",
    title: "WACC from weights",
    topic: "valuation",
    concept_id: CONCEPT.dcf,
    difficulty: "easy",
    description: "Blend cost of equity and after-tax cost of debt by market-value weights.",
    unit: "%",
  },
  sample(rng) {
    const equity_weight = rng.step(0.5, 0.9, 0.05)
    return {
      equity_weight,
      debt_weight: roundTo(1 - equity_weight, 2),
      cost_of_equity: rng.step(0.08, 0.14, 0.005),
      cost_of_debt: rng.step(0.04, 0.08, 0.005),
      tax_rate: rng.pick(TAX_RATES),
    }
  },
  prompt: (i) =>
    `A company's capital structure is ${fmtPct(i.equity_weight)} equity and ${fmtPct(i.debt_weight)} debt at market value. ` +
    `Cost of equity is ${fmtPct(i.cost_of_equity)}, pre-tax cost of debt is ${fmtPct(i.cost_of_debt)} and the tax rate is ${fmtPct(i.tax_rate)}. ` +
    `What is the WACC (in %)?`,
  compute: (i) => pctAbs(wacc(i) * 100, 0.1),
  explain(i) {
    const afterTaxRd = i.cost_of_debt * (1 - i.tax_rate)
    return steps([
      `WACC = E/V × Re + D/V × Rd × (1 − t).`,
      `After-tax cost of debt = ${fmtPct(i.cost_of_debt)} × (1 − ${fmtPct(i.tax_rate)}) = ${fmtPct(afterTaxRd, 3)}.`,
      `Equity piece = ${fmtPct(i.equity_weight)} × ${fmtPct(i.cost_of_equity)} = ${fmtPct(i.equity_weight * i.cost_of_equity, 3)}.`,
      `Debt piece = ${fmtPct(i.debt_weight)} × ${fmtPct(afterTaxRd, 3)} = ${fmtPct(i.debt_weight * afterTaxRd, 3)}.`,
      `WACC = ${fmtPct(wacc(i), 2)}. Debt is cheaper because interest is tax-deductible — the tax shield.`,
    ])
  },
})

type WaccCapmInputs = {
  risk_free: number
  beta: number
  equity_risk_premium: number
  market_cap: number
  debt: number
  cost_of_debt: number
  tax_rate: number
}

function capmWacc(i: WaccCapmInputs) {
  const re = capmCostOfEquity(i)
  const v = i.market_cap + i.debt
  const ew = i.market_cap / v
  const dw = i.debt / v
  return {
    re,
    ew,
    dw,
    wacc: wacc({
      equity_weight: ew,
      cost_of_equity: re,
      debt_weight: dw,
      cost_of_debt: i.cost_of_debt,
      tax_rate: i.tax_rate,
    }),
  }
}

const waccCapm = define<WaccCapmInputs>({
  meta: {
    id: "wacc_capm",
    title: "WACC with CAPM",
    topic: "valuation",
    concept_id: CONCEPT.dcf,
    difficulty: "medium",
    description: "Build cost of equity with CAPM, weight by market cap and debt, then blend.",
    unit: "%",
  },
  sample: (rng) => ({
    risk_free: rng.step(0.03, 0.05, 0.0025),
    beta: rng.step(0.8, 1.6, 0.1),
    equity_risk_premium: rng.step(0.05, 0.07, 0.005),
    market_cap: rng.step(600, 2400, 100),
    debt: rng.step(200, 1200, 100),
    cost_of_debt: rng.step(0.045, 0.08, 0.005),
    tax_rate: rng.pick(TAX_RATES),
  }),
  prompt: (i) =>
    `Risk-free rate ${fmtPct(i.risk_free)}, levered beta ${fmtNum(i.beta, 2)}, equity risk premium ${fmtPct(i.equity_risk_premium)}. ` +
    `Market cap is ${fmtMm(i.market_cap)} and debt (at market) is ${fmtMm(i.debt)}, with a pre-tax cost of debt of ${fmtPct(i.cost_of_debt)} and a ${fmtPct(i.tax_rate)} tax rate. ` +
    `What is the WACC (in %)?`,
  compute: (i) => pctAbs(capmWacc(i).wacc * 100, 0.15),
  explain(i) {
    const r = capmWacc(i)
    return steps([
      `Cost of equity (CAPM) = rf + β × ERP = ${fmtPct(i.risk_free)} + ${fmtNum(i.beta, 2)} × ${fmtPct(i.equity_risk_premium)} = ${fmtPct(r.re, 3)}.`,
      `V = E + D = ${fmtMm(i.market_cap)} + ${fmtMm(i.debt)} = ${fmtMm(i.market_cap + i.debt)}, so E/V = ${fmtPct(r.ew, 1)} and D/V = ${fmtPct(r.dw, 1)}.`,
      `After-tax cost of debt = ${fmtPct(i.cost_of_debt)} × (1 − ${fmtPct(i.tax_rate)}) = ${fmtPct(i.cost_of_debt * (1 - i.tax_rate), 3)}.`,
      `WACC = ${fmtPct(r.ew, 1)} × ${fmtPct(r.re, 3)} + ${fmtPct(r.dw, 1)} × ${fmtPct(i.cost_of_debt * (1 - i.tax_rate), 3)} = ${fmtPct(r.wacc, 2)}.`,
    ])
  },
})

/* ------------------------------------------------------------------ */
/* Returns: MOIC / IRR                                                */
/* ------------------------------------------------------------------ */

type MoicInputs = { entry_equity: number; exit_equity: number; years: number }

const moicBasic = define<MoicInputs>({
  meta: {
    id: "moic_basic",
    title: "MOIC",
    topic: "returns",
    concept_id: CONCEPT.lbo,
    difficulty: "easy",
    description: "Money multiple from equity in and equity out.",
    unit: "x",
  },
  sample(rng) {
    const entry_equity = rng.step(100, 800, 20)
    const multiple = rng.step(1.5, 4, 0.25)
    return { entry_equity, exit_equity: entry_equity * multiple, years: rng.int(3, 7) }
  },
  prompt: (i) =>
    `A sponsor invests ${fmtMm(i.entry_equity)} of equity and receives ${fmtMm(i.exit_equity)} at exit after ${i.years} years. What is the MOIC (x)?`,
  compute: (i) => ({ answer: moic(i), unit: "x", tolerance: 0.05, tolerance_kind: "absolute" }),
  explain: (i) =>
    steps([
      `MOIC = equity out ÷ equity in (the hold period does not matter for MOIC).`,
      `${fmtMm(i.exit_equity)} ÷ ${fmtMm(i.entry_equity)} = ${fmtX(moic(i))}.`,
    ]),
})

const IRR_RULES = "Rules of thumb: 2x in 3 yrs ≈ 26%, 2x in 5 yrs ≈ 15%, 3x in 5 yrs ≈ 25%, 2.5x in 5 yrs ≈ 20%."

const irrRuleOfThumb = define<MoicInputs>({
  meta: {
    id: "irr_rule_of_thumb",
    title: "IRR from MOIC and hold",
    topic: "returns",
    concept_id: CONCEPT.lbo,
    difficulty: "medium",
    description: "Approximate IRR from a money multiple and a hold period — mental math within 1pp.",
    unit: "%",
  },
  sample(rng) {
    const entry_equity = rng.step(100, 500, 50)
    const multiple = rng.pick([1.5, 2, 2.5, 3, 4] as const)
    return { entry_equity, exit_equity: entry_equity * multiple, years: rng.pick([3, 4, 5, 6, 7] as const) }
  },
  prompt: (i) =>
    `A sponsor puts in ${fmtMm(i.entry_equity)} of equity and exits for ${fmtMm(i.exit_equity)} after ${i.years} years, with no interim cash flows. ` +
    `What is the IRR (in %)? Within 1 percentage point is fine.`,
  compute: (i) => pctAbs(irrApprox(i) * 100, 1),
  explain(i) {
    const m = moic(i)
    return steps([
      `MOIC = ${fmtMm(i.exit_equity)} ÷ ${fmtMm(i.entry_equity)} = ${fmtX(m)}.`,
      `IRR solves (1 + IRR)^${i.years} = ${fmtX(m)}, so IRR = ${fmtNum(m, 2)}^(1/${i.years}) − 1.`,
      `IRR = ${fmtPct(irrApprox(i), 1)}.`,
      IRR_RULES,
    ])
  },
})

type IrrDividendInputs = {
  entry_equity: number
  dividend: number
  dividend_year: number
  exit_equity: number
  years: number
}

function dividendCashflows(i: IrrDividendInputs): number[] {
  const flows: number[] = [-i.entry_equity]
  for (let t = 1; t <= i.years; t += 1) {
    flows.push((t === i.dividend_year ? i.dividend : 0) + (t === i.years ? i.exit_equity : 0))
  }
  return flows
}

const irrWithDividend = define<IrrDividendInputs>({
  meta: {
    id: "irr_with_dividend",
    title: "IRR with a dividend recap",
    topic: "returns",
    concept_id: CONCEPT.lbo,
    difficulty: "hard",
    description: "Exact IRR when part of the return comes early through a dividend recap.",
    unit: "%",
  },
  sample(rng) {
    const entry_equity = rng.step(100, 400, 50)
    return {
      entry_equity,
      dividend: entry_equity * rng.pick([0.25, 0.5] as const),
      dividend_year: rng.pick([2, 3] as const),
      exit_equity: entry_equity * rng.step(1.5, 3, 0.25),
      years: rng.pick([4, 5] as const),
    }
  },
  prompt: (i) =>
    `A sponsor invests ${fmtMm(i.entry_equity)} at close. In year ${i.dividend_year} a dividend recap returns ${fmtMm(i.dividend)}, ` +
    `and the business is sold in year ${i.years} for ${fmtMm(i.exit_equity)} of equity proceeds. What is the IRR (in %)? Within 1.5 percentage points is fine.`,
  compute: (i) => pctAbs(irr(dividendCashflows(i)) * 100, 1.5),
  explain(i) {
    const flows = dividendCashflows(i)
    const exact = irr(flows)
    const total = i.dividend + i.exit_equity
    const noDivIrr = irrApprox({ entry_equity: i.entry_equity, exit_equity: total, years: i.years })
    return steps([
      `Cash flows: ${flows.map((f, t) => `Y${t} ${f < 0 ? "−" : ""}${fmtMm(Math.abs(f))}`).join(", ")}.`,
      `Total MOIC = (${fmtMm(i.dividend)} + ${fmtMm(i.exit_equity)}) ÷ ${fmtMm(i.entry_equity)} = ${fmtX(total / i.entry_equity)}.`,
      `If all proceeds came at exit, IRR = ${fmtX(total / i.entry_equity)}^(1/${i.years}) − 1 ≈ ${fmtPct(noDivIrr, 1)}.`,
      `Getting ${fmtMm(i.dividend)} back early in year ${i.dividend_year} lifts IRR (same MOIC, less time at risk).`,
      `Exact IRR (NPV = 0) = ${fmtPct(exact, 1)}; check: NPV at that rate = ${fmtNum(npv(exact, flows), 4)}.`,
    ])
  },
})

/* ------------------------------------------------------------------ */
/* EV ↔ equity bridge                                                 */
/* ------------------------------------------------------------------ */

type BridgeInputs = {
  enterprise_value: number
  gross_debt: number
  cash: number
  preferred: number
  nci: number
  shares?: number
}

function bridgeLines(i: BridgeInputs): string {
  const parts = [`total debt ${fmtMm(i.gross_debt)}`, `cash ${fmtMm(i.cash)}`]
  if (i.preferred) parts.push(`preferred stock ${fmtMm(i.preferred)}`)
  if (i.nci) parts.push(`non-controlling interest ${fmtMm(i.nci)}`)
  return parts.join(", ")
}

function sampleBridge(rng: Rng, equity_value: number): BridgeInputs {
  const gross_debt = rng.step(200, 3000, 100)
  const cash = rng.step(50, 1000, 50)
  const preferred = rng.pick([0, 0, 100, 150, 200] as const)
  const nci = rng.pick([0, 0, 50, 75] as const)
  const { enterprise_value } = evBridge({ equity_value, gross_debt, cash, preferred, nci })
  return { enterprise_value, gross_debt, cash, preferred, nci }
}

function bridgeExplain(i: BridgeInputs): string[] {
  const r = equityFromEv(i)
  return [
    `Equity value = EV − net debt − preferred − NCI (claims senior to or alongside common equity come out).`,
    `Net debt = ${fmtMm(i.gross_debt)} − ${fmtMm(i.cash)} = ${fmtMm(r.net_debt)}.`,
    `Equity value = ${fmtMm(i.enterprise_value)} − ${fmtMm(r.net_debt)}${i.preferred ? ` − ${fmtMm(i.preferred)}` : ""}${i.nci ? ` − ${fmtMm(i.nci)}` : ""} = ${fmtMm(r.equity_value)}.`,
  ]
}

const evToEquity = define<BridgeInputs>({
  meta: {
    id: "ev_to_equity",
    title: "EV → equity value",
    topic: "enterprise_value",
    concept_id: CONCEPT.ev,
    difficulty: "easy",
    description: "Walk from enterprise value to equity value through net debt, preferred and NCI.",
    unit: "$mm",
  },
  sample: (rng) => sampleBridge(rng, rng.step(1000, 8000, 250)),
  prompt: (i) =>
    `A company has an enterprise value of ${fmtMm(i.enterprise_value)}. The balance sheet shows ${bridgeLines(i)}. What is the equity value ($mm)?`,
  compute: (i) => mmRel(equityFromEv(i).equity_value),
  explain: (i) => steps(bridgeExplain(i)),
})

const evToSharePrice = define<BridgeInputs>({
  meta: {
    id: "ev_to_share_price",
    title: "EV → implied share price",
    topic: "enterprise_value",
    concept_id: CONCEPT.ev,
    difficulty: "medium",
    description: "Bridge EV to equity value, then divide by diluted shares.",
    unit: "$",
  },
  sample(rng) {
    const price = rng.step(10, 150, 1)
    const shares = rng.step(50, 400, 10)
    return { ...sampleBridge(rng, price * shares), shares }
  },
  prompt: (i) =>
    `Enterprise value is ${fmtMm(i.enterprise_value)}; ${bridgeLines(i)}. There are ${fmtNum(i.shares ?? 0)}mm diluted shares outstanding. ` +
    `What is the implied share price ($)?`,
  compute: (i) => ({
    answer: equityFromEv(i).equity_value / (i.shares ?? 1),
    unit: "$",
    tolerance: 0.01,
    tolerance_kind: "relative",
  }),
  explain(i) {
    const eq = equityFromEv(i).equity_value
    return steps([
      ...bridgeExplain(i),
      `Implied share price = ${fmtMm(eq)} ÷ ${fmtNum(i.shares ?? 0)}mm shares = ${fmtUsd(eq / (i.shares ?? 1))}.`,
    ])
  },
})

/* ------------------------------------------------------------------ */
/* Paper LBO                                                          */
/* ------------------------------------------------------------------ */

type LboExitInputs = {
  sponsor_equity: number
  ebitda_exit: number
  exit_multiple: number
  net_debt_exit: number
}

const lboExit = define<LboExitInputs>({
  meta: {
    id: "lbo_exit_equity",
    title: "LBO exit equity",
    topic: "lbo",
    concept_id: CONCEPT.lbo,
    difficulty: "easy",
    description: "Exit EV from EBITDA × multiple, less net debt at exit.",
    unit: "$mm",
  },
  sample(rng) {
    const ebitda_exit = rng.step(50, 300, 10)
    const exit_multiple = rng.step(7, 12, 0.5)
    const net_debt_exit = ebitda_exit * rng.step(1.5, 4, 0.5)
    return {
      ebitda_exit,
      exit_multiple,
      net_debt_exit,
      sponsor_equity: roundTo(ebitda_exit * rng.step(2, 4, 0.5), 0),
    }
  },
  prompt: (i) =>
    `At exit the company earns ${fmtMm(i.ebitda_exit)} of EBITDA and sells at ${fmtX(i.exit_multiple, 1)} EBITDA. ` +
    `Net debt at exit is ${fmtMm(i.net_debt_exit)}. What are the sponsor's exit equity proceeds ($mm)?`,
  compute: (i) => mmRel(lboExitEquity(i).exit_equity),
  explain(i) {
    const ev = i.ebitda_exit * i.exit_multiple
    const r = lboExitEquity(i)
    return steps([
      `Exit EV = ${fmtMm(i.ebitda_exit)} × ${fmtX(i.exit_multiple, 1)} = ${fmtMm(ev)}.`,
      `Exit equity = exit EV − net debt = ${fmtMm(ev)} − ${fmtMm(i.net_debt_exit)} = ${fmtMm(r.exit_equity)}.`,
      `On ${fmtMm(i.sponsor_equity)} invested that is a ${fmtX(r.moic)} MOIC.`,
    ])
  },
})

type PaperLboInputs = {
  ebitda_entry: number
  entry_multiple: number
  leverage: number
  ebitda_exit: number
  exit_multiple: number
  debt_paydown: number
  years: number
}

function paperLbo(i: PaperLboInputs) {
  const entry_ev = i.ebitda_entry * i.entry_multiple
  const debt = i.ebitda_entry * i.leverage
  const sponsor_equity = entry_ev - debt
  const net_debt_exit = debt - i.debt_paydown
  const r = lboExitEquity({
    sponsor_equity,
    ebitda_exit: i.ebitda_exit,
    exit_multiple: i.exit_multiple,
    net_debt_exit,
  })
  return { entry_ev, debt, sponsor_equity, net_debt_exit, ...r }
}

const paperLboMoic = define<PaperLboInputs>({
  meta: {
    id: "paper_lbo_moic",
    title: "Paper LBO returns",
    topic: "lbo",
    concept_id: CONCEPT.lbo,
    difficulty: "medium",
    description: "Sources & uses, EBITDA growth, debt paydown → sponsor MOIC.",
    unit: "x",
  },
  sample(rng) {
    const ebitda_entry = rng.step(50, 200, 10)
    const entry_multiple = rng.step(8, 12, 0.5)
    // Cap debt at 60% of EV (rounded down to 0.5x) so equity is a realistic 40%+.
    const leverage = Math.min(rng.step(4, 6, 0.5), Math.floor(entry_multiple * 0.6 * 2) / 2)
    const debt = ebitda_entry * leverage
    return {
      ebitda_entry,
      entry_multiple,
      leverage,
      ebitda_exit: roundTo(ebitda_entry * rng.pick([1.3, 1.4, 1.5, 1.6, 1.8, 2] as const), 0),
      exit_multiple: roundTo(entry_multiple + rng.pick([-0.5, 0, 0, 0.5] as const), 1),
      debt_paydown: roundTo(debt * rng.pick([0.2, 0.3, 0.4, 0.5] as const), 0),
      years: 5,
    }
  },
  prompt: (i) =>
    `A sponsor buys a company with ${fmtMm(i.ebitda_entry)} of EBITDA at ${fmtX(i.entry_multiple, 1)}, funded with ${fmtX(i.leverage, 1)} EBITDA of debt and the rest equity (ignore fees). ` +
    `Over ${i.years} years EBITDA grows to ${fmtMm(i.ebitda_exit)} and ${fmtMm(i.debt_paydown)} of debt is repaid from free cash flow. ` +
    `It exits at ${fmtX(i.exit_multiple, 1)} EBITDA. What is the sponsor's MOIC (x)?`,
  compute: (i) => ({ answer: paperLbo(i).moic, unit: "x", tolerance: 0.02, tolerance_kind: "relative" }),
  explain(i) {
    const r = paperLbo(i)
    const exitEv = i.ebitda_exit * i.exit_multiple
    return steps([
      `Entry EV = ${fmtMm(i.ebitda_entry)} × ${fmtX(i.entry_multiple, 1)} = ${fmtMm(r.entry_ev)}; debt = ${fmtX(i.leverage, 1)} × ${fmtMm(i.ebitda_entry)} = ${fmtMm(r.debt)}.`,
      `Sponsor equity = ${fmtMm(r.entry_ev)} − ${fmtMm(r.debt)} = ${fmtMm(r.sponsor_equity)}.`,
      `Exit EV = ${fmtMm(i.ebitda_exit)} × ${fmtX(i.exit_multiple, 1)} = ${fmtMm(exitEv)}; net debt at exit = ${fmtMm(r.debt)} − ${fmtMm(i.debt_paydown)} = ${fmtMm(r.net_debt_exit)}.`,
      `Exit equity = ${fmtMm(exitEv)} − ${fmtMm(r.net_debt_exit)} = ${fmtMm(r.exit_equity)}.`,
      `MOIC = ${fmtMm(r.exit_equity)} ÷ ${fmtMm(r.sponsor_equity)} = ${fmtX(r.moic)} (IRR ≈ ${fmtPct(irrApprox({ entry_equity: r.sponsor_equity, exit_equity: r.exit_equity, years: i.years }), 1)} over ${i.years} years).`,
    ])
  },
})

/* ------------------------------------------------------------------ */
/* Accretion / dilution                                               */
/* ------------------------------------------------------------------ */

type MergerInputs = {
  acquirer_eps: number
  acquirer_pe: number
  acquirer_shares: number
  target_net_income: number
  offer_pe: number
  interest_rate: number
  tax_rate: number
  financing: "stock" | "debt"
}

function merger(i: MergerInputs) {
  const acquirer_price = i.acquirer_eps * i.acquirer_pe
  const acquirer_net_income = i.acquirer_eps * i.acquirer_shares
  const purchase_price = i.target_net_income * i.offer_pe
  const stock = i.financing === "stock"
  const pf = proFormaEps({
    acquirer_net_income,
    target_net_income: i.target_net_income,
    acquirer_shares: i.acquirer_shares,
    new_shares: stock ? purchase_price / acquirer_price : 0,
    new_debt: stock ? 0 : purchase_price,
    interest_rate: i.interest_rate,
    tax_rate: i.tax_rate,
  })
  const ad = accretionDilution({ acquirer_eps: i.acquirer_eps, combined_eps: pf.combined_eps })
  return { acquirer_price, acquirer_net_income, purchase_price, ...pf, ...ad }
}

function sampleMerger(rng: Rng, financing: "stock" | "debt"): MergerInputs {
  return {
    acquirer_eps: rng.step(1, 5, 0.25),
    acquirer_pe: rng.pick([12, 15, 16, 18, 20, 24, 25] as const),
    acquirer_shares: rng.step(100, 400, 20),
    target_net_income: rng.step(20, 150, 5),
    offer_pe: rng.pick([10, 12, 14, 15, 16, 18, 20, 22, 25, 30] as const),
    interest_rate: rng.step(0.05, 0.09, 0.005),
    tax_rate: rng.pick(TAX_RATES),
    financing,
  }
}

function mergerPrompt(i: MergerInputs): string {
  const m = merger(i)
  const funding =
    i.financing === "stock"
      ? `The deal is paid 100% in new acquirer shares issued at the current share price.`
      : `The deal is funded 100% with new debt at ${fmtPct(i.interest_rate)} interest; tax rate ${fmtPct(i.tax_rate)}.`
  return (
    `Acquirer: ${fmtNum(i.acquirer_shares)}mm shares, EPS ${fmtUsd(i.acquirer_eps)}, share price ${fmtUsd(m.acquirer_price)} (${i.acquirer_pe}x P/E). ` +
    `Target: net income ${fmtMm(i.target_net_income)}, bought for ${fmtMm(m.purchase_price)} (${i.offer_pe}x P/E). ${funding} ` +
    `Ignoring synergies and fees, what is the EPS accretion / (dilution) in %? Use a negative number for dilution.`
  )
}

function mergerExplain(i: MergerInputs): string {
  const m = merger(i)
  const lines = [
    `Acquirer stand-alone net income = ${fmtNum(i.acquirer_shares)}mm × ${fmtUsd(i.acquirer_eps)} = ${fmtMm(m.acquirer_net_income)}.`,
  ]
  if (i.financing === "stock") {
    const newShares = m.combined_shares - i.acquirer_shares
    lines.push(
      `New shares = ${fmtMm(m.purchase_price)} ÷ ${fmtUsd(m.acquirer_price)} = ${fmtNum(newShares, 2)}mm; pro-forma shares = ${fmtNum(m.combined_shares, 2)}mm.`,
      `Pro-forma net income = ${fmtMm(m.acquirer_net_income)} + ${fmtMm(i.target_net_income)} = ${fmtMm(m.combined_net_income)}.`,
    )
  } else {
    lines.push(
      `After-tax interest = ${fmtMm(m.purchase_price)} × ${fmtPct(i.interest_rate)} × (1 − ${fmtPct(i.tax_rate)}) = ${fmtMm(m.after_tax_cost, 2)}.`,
      `Pro-forma net income = ${fmtMm(m.acquirer_net_income)} + ${fmtMm(i.target_net_income)} − ${fmtMm(m.after_tax_cost, 2)} = ${fmtMm(m.combined_net_income, 2)}; shares unchanged at ${fmtNum(i.acquirer_shares)}mm.`,
    )
  }
  lines.push(
    `Pro-forma EPS = ${fmtUsd(m.combined_eps, 3)} vs ${fmtUsd(i.acquirer_eps)} stand-alone → ${fmtPct(m.eps_delta, 2)} (${m.accretive ? "accretive" : "dilutive"}).`,
  )
  if (i.financing === "stock") {
    lines.push(
      `Shortcut: an all-stock deal is accretive when the acquirer's P/E (${i.acquirer_pe}x) exceeds the P/E paid (${i.offer_pe}x).`,
    )
  } else {
    lines.push(
      `Shortcut: an all-debt deal is accretive when the target's earnings yield (1/${i.offer_pe} = ${fmtPct(1 / i.offer_pe, 2)}) exceeds the after-tax cost of debt (${fmtPct(i.interest_rate * (1 - i.tax_rate), 2)}).`,
    )
  }
  return steps(lines)
}

const accretionStock = define<MergerInputs>({
  meta: {
    id: "accretion_stock",
    title: "Accretion / dilution — all stock",
    topic: "merger_models",
    concept_id: null,
    difficulty: "medium",
    description: "Pro-forma EPS when the acquirer pays in its own shares.",
    unit: "%",
  },
  sample: (rng) => sampleMerger(rng, "stock"),
  prompt: mergerPrompt,
  compute: (i) => pctAbs(merger(i).eps_delta * 100, 0.3),
  explain: mergerExplain,
})

const accretionDebt = define<MergerInputs>({
  meta: {
    id: "accretion_debt",
    title: "Accretion / dilution — all debt",
    topic: "merger_models",
    concept_id: null,
    difficulty: "hard",
    description: "Pro-forma EPS when the deal is funded with new debt (after-tax interest).",
    unit: "%",
  },
  sample: (rng) => sampleMerger(rng, "debt"),
  prompt: mergerPrompt,
  compute: (i) => pctAbs(merger(i).eps_delta * 100, 0.3),
  explain: mergerExplain,
})

/* ------------------------------------------------------------------ */
/* Unlevered FCF                                                      */
/* ------------------------------------------------------------------ */

type UfcfInputs = { ebit: number; tax_rate: number; da: number; capex: number; delta_nwc: number }

const ufcfBuild = define<UfcfInputs>({
  meta: {
    id: "ufcf_build",
    title: "Unlevered free cash flow",
    topic: "valuation",
    concept_id: CONCEPT.dcf,
    difficulty: "easy",
    description: "NOPAT + D&A − CapEx − ΔNWC.",
    unit: "$mm",
  },
  sample(rng) {
    const da = rng.step(10, 80, 5)
    return {
      ebit: rng.step(150, 500, 10),
      tax_rate: rng.pick(TAX_RATES),
      da,
      // Maintenance-plus-growth CapEx ≥ D&A keeps UFCF comfortably positive.
      capex: da + rng.step(0, 40, 5),
      delta_nwc: rng.step(-20, 20, 5),
    }
  },
  prompt: (i) =>
    `EBIT is ${fmtMm(i.ebit)}, the tax rate is ${fmtPct(i.tax_rate)}, D&A is ${fmtMm(i.da)}, CapEx is ${fmtMm(i.capex)} ` +
    (i.delta_nwc === 0
      ? `and net working capital is unchanged. `
      : `and net working capital ${i.delta_nwc > 0 ? "increases" : "decreases"} by ${fmtMm(Math.abs(i.delta_nwc))}. `) +
    `What is unlevered free cash flow ($mm)?`,
  compute: (i) => mmRel(ufcf(i)),
  explain(i) {
    const nopat = i.ebit * (1 - i.tax_rate)
    return steps([
      `UFCF = EBIT × (1 − t) + D&A − CapEx − ΔNWC (unlevered: no interest, taxes on EBIT).`,
      `NOPAT = ${fmtMm(i.ebit)} × (1 − ${fmtPct(i.tax_rate)}) = ${fmtMm(nopat, 2)}.`,
      `Add D&A ${fmtMm(i.da)}, subtract CapEx ${fmtMm(i.capex)}${
        i.delta_nwc === 0
          ? " (no working-capital change)"
          : i.delta_nwc > 0
            ? `, subtract the NWC increase ${fmtMm(i.delta_nwc)}`
            : `, add back the NWC decrease ${fmtMm(-i.delta_nwc)}`
      }.`,
      `UFCF = ${fmtMm(ufcf(i), 2)}.`,
    ])
  },
})

/* ------------------------------------------------------------------ */
/* Three statements + working capital                                 */
/* ------------------------------------------------------------------ */

const DA_LINES = {
  net_income_change: "net income",
  cfo_change: "cash flow from operations",
  cash_change: "the ending cash balance",
  ppe_change: "net PP&E",
  retained_earnings_change: "retained earnings (shareholders' equity)",
  total_assets_change: "total assets",
} as const

type DaInputs = { da_change: number; tax_rate: number; asked: keyof typeof DA_LINES }

const threeStatementDa = define<DaInputs>({
  meta: {
    id: "three_statement_da",
    title: "D&A through the 3 statements",
    topic: "accounting",
    concept_id: CONCEPT.accounting,
    difficulty: "easy",
    description: "The classic: D&A moves — what happens to NI, cash, PP&E and equity?",
    unit: "$",
  },
  sample: (rng) => ({
    da_change: rng.pick([10, 10, 20, 25, 50, 100] as const) * rng.pick([1, 1, 1, -1] as const),
    tax_rate: rng.pick([0.2, 0.25, 0.3, 0.4] as const),
    asked: rng.pick(Object.keys(DA_LINES) as Array<keyof typeof DA_LINES>),
  }),
  prompt: (i) =>
    `Depreciation ${i.da_change > 0 ? "increases" : "decreases"} by $${Math.abs(i.da_change)} with a ${fmtPct(i.tax_rate)} tax rate. ` +
    `Assume no other changes (depreciation is tax-deductible and non-cash). ` +
    `By how much does ${DA_LINES[i.asked]} change? Use a negative number for a decrease.`,
  compute: (i) => ({
    answer: daFlowThrough(i)[i.asked],
    unit: "$",
    tolerance: 0.05,
    tolerance_kind: "absolute",
  }),
  explain(i) {
    const r = daFlowThrough(i)
    const x = i.da_change
    return steps([
      `Income statement: pre-tax income ${fmtSigned(r.pretax_income_change)}; taxes ${fmtSigned(r.tax_change)} (${fmtPct(i.tax_rate)} × ${fmtSigned(-x)}); net income ${fmtSigned(r.net_income_change)}.`,
      `Cash flow statement: net income ${fmtSigned(r.net_income_change)}, add back the non-cash D&A ${fmtSigned(x)} → CFO ${fmtSigned(r.cfo_change)}. Cash ${fmtSigned(r.cash_change)} — only the tax effect of the D&A change (${fmtPct(i.tax_rate)} × ${fmtSigned(x)}) hits cash.`,
      `Balance sheet: cash ${fmtSigned(r.cash_change)}, PP&E ${fmtSigned(r.ppe_change)} → total assets ${fmtSigned(r.total_assets_change)}.`,
      `Liabilities + equity: retained earnings ${fmtSigned(r.retained_earnings_change)} (net income flows in) — both sides move ${fmtSigned(r.total_assets_change)}, so it balances.`,
      `Answer — ${DA_LINES[i.asked]}: ${fmtSigned(r[i.asked])}.`,
    ])
  },
})

type NwcInputs = {
  receivables_begin: number
  inventory_begin: number
  payables_begin: number
  receivables_end: number
  inventory_end: number
  payables_end: number
  asked: "delta_nwc" | "cash_impact"
}

function nwcResult(i: NwcInputs) {
  return nwcChange({
    begin: { receivables: i.receivables_begin, inventory: i.inventory_begin, payables: i.payables_begin },
    end: { receivables: i.receivables_end, inventory: i.inventory_end, payables: i.payables_end },
  })
}

const nwcDrill = define<NwcInputs>({
  meta: {
    id: "nwc_change",
    title: "Change in working capital",
    topic: "working_capital",
    concept_id: CONCEPT.accounting,
    difficulty: "medium",
    description: "AR, inventory and AP move — what is ΔNWC and its cash impact?",
    unit: "$mm",
  },
  sample(rng) {
    const receivables_begin = rng.step(100, 400, 10)
    const inventory_begin = rng.step(80, 300, 10)
    const payables_begin = rng.step(60, 250, 10)
    const inputs: NwcInputs = {
      receivables_begin,
      inventory_begin,
      payables_begin,
      receivables_end: receivables_begin + rng.step(-40, 60, 5),
      inventory_end: inventory_begin + rng.step(-30, 50, 5),
      payables_end: payables_begin + rng.step(-30, 50, 5),
      asked: rng.pick(["delta_nwc", "cash_impact"] as const),
    }
    if (nwcResult(inputs).delta_nwc === 0) inputs.receivables_end += 10
    return inputs
  },
  prompt: (i) =>
    `Last year: receivables ${fmtMm(i.receivables_begin)}, inventory ${fmtMm(i.inventory_begin)}, payables ${fmtMm(i.payables_begin)}. ` +
    `This year: receivables ${fmtMm(i.receivables_end)}, inventory ${fmtMm(i.inventory_end)}, payables ${fmtMm(i.payables_end)}. ` +
    (i.asked === "delta_nwc"
      ? `What is the change in net working capital ($mm)? Use a negative number if NWC fell.`
      : `What is the impact on cash flow from operations ($mm)? Use a negative number for a use of cash.`),
  compute(i) {
    const r = nwcResult(i)
    return { answer: r[i.asked], unit: "$mm", tolerance: 0.5, tolerance_kind: "absolute" }
  },
  explain(i) {
    const r = nwcResult(i)
    return steps([
      `NWC = receivables + inventory − payables (operating items only).`,
      `Last year NWC = ${fmtMm(i.receivables_begin)} + ${fmtMm(i.inventory_begin)} − ${fmtMm(i.payables_begin)} = ${fmtMm(r.nwc_begin)}.`,
      `This year NWC = ${fmtMm(i.receivables_end)} + ${fmtMm(i.inventory_end)} − ${fmtMm(i.payables_end)} = ${fmtMm(r.nwc_end)}.`,
      `ΔNWC = ${fmtSigned(r.delta_nwc, 1)}mm. An increase in NWC ties up cash (a use); a decrease releases cash.`,
      `Cash flow impact = −ΔNWC = ${fmtSigned(r.cash_impact, 1)}mm.`,
    ])
  },
})

/* ------------------------------------------------------------------ */
/* Trading comps                                                      */
/* ------------------------------------------------------------------ */

type CompsInputs = {
  metric: number
  multiples: number[]
  peers: string[]
  net_debt: number
  shares: number | null
}

const PEER_NAMES = ["Alder", "Birch", "Cedar", "Dogwood", "Elm", "Fir", "Hazel", "Juniper", "Linden", "Maple"] as const

function sampleComps(rng: Rng, withEquity: boolean): CompsInputs {
  const count = rng.pick([4, 5, 5] as const)
  const multiples = Array.from({ length: count }, () => rng.step(6, 14, 0.5))
  const start = rng.int(0, PEER_NAMES.length - count)
  const metric = rng.step(40, 400, 10)
  return {
    metric,
    multiples,
    peers: PEER_NAMES.slice(start, start + count).map((n) => `${n} Co`),
    net_debt: withEquity ? roundTo(metric * rng.step(0.5, 3, 0.5), 0) : 0,
    shares: withEquity ? rng.step(20, 200, 5) : null,
  }
}

function compsTable(i: CompsInputs): string {
  return i.peers.map((p, k) => `${p} ${fmtX(i.multiples[k] as number, 1)}`).join(", ")
}

const compsImpliedEv = define<CompsInputs>({
  meta: {
    id: "comps_implied_ev",
    title: "Comps — implied EV",
    topic: "valuation",
    concept_id: CONCEPT.ev,
    difficulty: "easy",
    description: "Apply the median peer EV/EBITDA multiple to the target's EBITDA.",
    unit: "$mm",
  },
  sample: (rng) => sampleComps(rng, false),
  prompt: (i) =>
    `Peer EV/EBITDA multiples: ${compsTable(i)}. The target's LTM EBITDA is ${fmtMm(i.metric)}. ` +
    `Using the median multiple, what is the target's implied enterprise value ($mm)?`,
  compute: (i) => mmRel(compsImpliedValue(i).implied_ev),
  explain(i) {
    const r = compsImpliedValue(i)
    const sorted = [...i.multiples].sort((a, b) => a - b)
    return steps([
      `Sort the multiples: ${sorted.map((m) => fmtX(m, 1)).join(", ")}.`,
      `Median = ${fmtX(r.median_multiple, 2)} (mean ${fmtX(r.mean_multiple, 2)} — the median resists outliers).`,
      `Implied EV = ${fmtMm(i.metric)} × ${fmtX(r.median_multiple, 2)} = ${fmtMm(r.implied_ev)}.`,
    ])
  },
})

const compsImpliedSharePrice = define<CompsInputs>({
  meta: {
    id: "comps_implied_share_price",
    title: "Comps — implied share price",
    topic: "valuation",
    concept_id: CONCEPT.ev,
    difficulty: "hard",
    description: "Median multiple → implied EV → less net debt → per share.",
    unit: "$",
  },
  sample: (rng) => sampleComps(rng, true),
  prompt: (i) =>
    `Peer EV/EBITDA multiples: ${compsTable(i)}. The target has ${fmtMm(i.metric)} of EBITDA, ${fmtMm(i.net_debt)} of net debt ` +
    `and ${fmtNum(i.shares ?? 0)}mm diluted shares. Using the median multiple, what is the implied share price ($)?`,
  compute: (i) => ({
    answer: compsImpliedValue(i).implied_share_price ?? 0,
    unit: "$",
    tolerance: 0.01,
    tolerance_kind: "relative",
  }),
  explain(i) {
    const r = compsImpliedValue(i)
    return steps([
      `Median EV/EBITDA = ${fmtX(r.median_multiple, 2)}.`,
      `Implied EV = ${fmtMm(i.metric)} × ${fmtX(r.median_multiple, 2)} = ${fmtMm(r.implied_ev)}.`,
      `Implied equity = EV − net debt = ${fmtMm(r.implied_ev)} − ${fmtMm(i.net_debt)} = ${fmtMm(r.implied_equity)}.`,
      `Per share = ${fmtMm(r.implied_equity)} ÷ ${fmtNum(i.shares ?? 0)}mm = ${fmtUsd(r.implied_share_price ?? 0)}.`,
    ])
  },
})

/* ------------------------------------------------------------------ */
/* Registry                                                           */
/* ------------------------------------------------------------------ */

export const DRILL_TEMPLATES: readonly DrillTemplate[] = [
  waccWeights,
  waccCapm,
  ufcfBuild,
  moicBasic,
  irrRuleOfThumb,
  irrWithDividend,
  lboExit,
  paperLboMoic,
  evToEquity,
  evToSharePrice,
  compsImpliedEv,
  compsImpliedSharePrice,
  accretionStock,
  accretionDebt,
  threeStatementDa,
  nwcDrill,
]

const BY_ID = new Map(DRILL_TEMPLATES.map((t) => [t.meta.id, t]))

export function getDrillTemplate(templateId: string): DrillTemplate | null {
  return BY_ID.get(templateId) ?? null
}

export function listDrillTemplates(): DrillTemplateMeta[] {
  return DRILL_TEMPLATES.map((t) => ({ ...t.meta }))
}

const SEED_RE = /^[A-Za-z0-9_-]{1,64}$/

export function drillId(templateId: string, seed: string): string {
  return `drill:${templateId}:${seed}`
}

export function generateDrill(templateId: string, seed: string): GeneratedDrill | null {
  const template = getDrillTemplate(templateId)
  if (!template || !SEED_RE.test(seed)) return null
  // Namespace the RNG by template so one seed gives unrelated numbers per template.
  const inputs = template.sample(createRng(`${templateId}:${seed}`))
  const answer = template.compute(inputs)
  if (!Number.isFinite(answer.answer)) return null
  const unit = answer.unit ?? template.meta.unit ?? null
  return {
    instance: {
      id: drillId(templateId, seed),
      template_id: templateId,
      seed,
      topic: template.meta.topic,
      concept_id: template.meta.concept_id,
      difficulty: template.meta.difficulty,
      prompt: template.prompt(inputs),
      inputs: JSON.parse(JSON.stringify(inputs)) as Record<string, unknown>,
      unit,
    },
    solution: {
      answer: answer.answer,
      unit,
      tolerance: answer.tolerance,
      tolerance_kind: answer.tolerance_kind,
      explanation: template.explain(inputs),
    },
  }
}

/** Parse `drill:<template_id>:<seed>`. */
export function parseDrillId(id: string): { templateId: string; seed: string } | null {
  const match = /^drill:([a-z0-9_]+):([A-Za-z0-9_-]+)$/.exec(id)
  return match ? { templateId: match[1] as string, seed: match[2] as string } : null
}

/** Absolute allowed error for a solution (relative tolerances scale with |answer|). */
export function allowedError(solution: { answer: number; tolerance: number; tolerance_kind: ToleranceKind }): number {
  return solution.tolerance_kind === "relative"
    ? Math.abs(solution.answer) * solution.tolerance
    : solution.tolerance
}

/** True when `value` is within the solution's tolerance (with float slack). */
export function withinTolerance(
  solution: { answer: number; tolerance: number; tolerance_kind: ToleranceKind },
  value: number,
): boolean {
  return Math.abs(value - solution.answer) <= allowedError(solution) + 1e-9
}
