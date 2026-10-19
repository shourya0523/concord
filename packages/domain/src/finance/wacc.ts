import { CalculatorError } from "./errors.js"

export type WaccInputs = {
  equity_weight: number
  cost_of_equity: number
  debt_weight: number
  cost_of_debt: number
  tax_rate: number
}

/** After-tax WACC = E/V·Re + D/V·Rd·(1−t). Parity: calculators.py `wacc`. */
export function wacc({
  equity_weight,
  cost_of_equity,
  debt_weight,
  cost_of_debt,
  tax_rate,
}: WaccInputs): number {
  if (tax_rate < 0 || tax_rate >= 1) {
    throw new CalculatorError(`tax_rate out of range: ${tax_rate}`)
  }
  return equity_weight * cost_of_equity + debt_weight * cost_of_debt * (1.0 - tax_rate)
}

/** CAPM cost of equity = rf + β·ERP (helper for WACC drills). */
export function capmCostOfEquity({
  risk_free,
  beta,
  equity_risk_premium,
}: {
  risk_free: number
  beta: number
  equity_risk_premium: number
}): number {
  return risk_free + beta * equity_risk_premium
}
