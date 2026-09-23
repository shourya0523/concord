import { CalculatorError } from "./errors.js"
import { moic } from "./moic.js"

/** Compound IRR from MOIC and hold period. Parity: calculators.py `irr_approx`. */
export function irrApprox({
  entry_equity,
  exit_equity,
  years,
}: {
  entry_equity: number
  exit_equity: number
  years: number
}): number {
  if (years <= 0) throw new CalculatorError("years must be positive")
  const multiple = moic({ entry_equity, exit_equity })
  if (multiple < 0) throw new CalculatorError("MOIC must be non-negative for IRR approx")
  return multiple ** (1.0 / years) - 1.0
}

/** Net present value of annual cash flows (t = 0, 1, 2, …). */
export function npv(rate: number, cashflows: readonly number[]): number {
  let total = 0
  for (let t = 0; t < cashflows.length; t += 1) {
    total += (cashflows[t] as number) / (1 + rate) ** t
  }
  return total
}

/**
 * Exact IRR of annual cash flows by bisection on NPV, bracketed in
 * (-99%, 1000%). Needs a sign change; deterministic to ~1e-12.
 */
export function irr(cashflows: readonly number[]): number {
  if (cashflows.length < 2) throw new CalculatorError("need at least two cash flows")
  if (!cashflows.some((c) => c < 0) || !cashflows.some((c) => c > 0)) {
    throw new CalculatorError("cash flows need a sign change")
  }
  let lo = -0.99
  let hi = 10
  let fLo = npv(lo, cashflows)
  if (fLo * npv(hi, cashflows) > 0) {
    throw new CalculatorError("IRR not bracketed in (-99%, 1000%)")
  }
  for (let i = 0; i < 200 && hi - lo > 1e-13; i += 1) {
    const mid = (lo + hi) / 2
    const fMid = npv(mid, cashflows)
    if (fMid === 0) return mid
    if (fLo * fMid < 0) {
      hi = mid
    } else {
      lo = mid
      fLo = fMid
    }
  }
  return (lo + hi) / 2
}
