import { CalculatorError } from "./errors.js"

export type DaFlowThrough = {
  /** Income statement: pre-tax income falls by the D&A change. */
  pretax_income_change: number
  tax_change: number
  net_income_change: number
  /** Cash flow statement: NI change + D&A add-back. */
  cfo_change: number
  cash_change: number
  /** Balance sheet. */
  ppe_change: number
  total_assets_change: number
  retained_earnings_change: number
  liabilities_equity_change: number
  /** 1 when assets change = liabilities + equity change. */
  balanced: number
}

/**
 * Classic "D&A goes up by X" three-statement flow-through (non-cash expense,
 * tax-deductible, no debt effects):
 *   IS  pre-tax −X, tax −X·t, NI −X(1−t)
 *   CFS NI −X(1−t) + D&A add-back X → CFO +X·t → cash +X·t
 *   BS  PP&E −X, cash +X·t (assets −X(1−t)) = RE −X(1−t)
 */
export function daFlowThrough({
  da_change,
  tax_rate,
}: {
  da_change: number
  tax_rate: number
}): DaFlowThrough {
  if (tax_rate < 0 || tax_rate >= 1) {
    throw new CalculatorError(`tax_rate out of range: ${tax_rate}`)
  }
  const pretax = -da_change
  const tax = pretax * tax_rate
  const ni = pretax - tax
  const cfo = ni + da_change
  const cash = cfo
  const ppe = -da_change
  const assets = cash + ppe
  const re = ni
  return {
    pretax_income_change: pretax,
    tax_change: tax,
    net_income_change: ni,
    cfo_change: cfo,
    cash_change: cash,
    ppe_change: ppe,
    total_assets_change: assets,
    retained_earnings_change: re,
    liabilities_equity_change: re,
    balanced: Math.abs(assets - re) < 1e-9 ? 1 : 0,
  }
}

/**
 * Cash operating expense up by X (e.g. a bonus paid in cash): NI −X(1−t),
 * no add-back, so CFO and cash also fall by X(1−t); RE −X(1−t).
 */
export function cashExpenseFlowThrough({
  expense_change,
  tax_rate,
}: {
  expense_change: number
  tax_rate: number
}): { net_income_change: number; cfo_change: number; cash_change: number; retained_earnings_change: number; balanced: number } {
  if (tax_rate < 0 || tax_rate >= 1) {
    throw new CalculatorError(`tax_rate out of range: ${tax_rate}`)
  }
  const ni = -expense_change * (1 - tax_rate)
  return {
    net_income_change: ni,
    cfo_change: ni,
    cash_change: ni,
    retained_earnings_change: ni,
    balanced: 1,
  }
}
