import { CalculatorError } from "./errors.js"

export type LboExitInputs = {
  sponsor_equity: number
  ebitda_exit?: number | null
  exit_multiple?: number | null
  net_debt_exit?: number | null
  exit_equity?: number | null
}

/** Exit equity and MOIC for a paper-LBO bridge. Parity: calculators.py `lbo_exit_equity`. */
export function lboExitEquity({
  ebitda_exit = null,
  exit_multiple = null,
  net_debt_exit = null,
  sponsor_equity,
  exit_equity = null,
}: LboExitInputs): { exit_equity: number; moic: number } {
  let eq: number
  if (exit_equity != null) {
    eq = Number(exit_equity)
  } else {
    if (ebitda_exit == null || exit_multiple == null || net_debt_exit == null) {
      throw new CalculatorError(
        "Provide exit_equity or (ebitda_exit, exit_multiple, net_debt_exit)",
      )
    }
    eq = Number(ebitda_exit) * Number(exit_multiple) - Number(net_debt_exit)
  }
  if (sponsor_equity === 0) throw new CalculatorError("sponsor_equity must be non-zero")
  return { exit_equity: eq, moic: eq / sponsor_equity }
}
