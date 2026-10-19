import { CalculatorError } from "./errors.js"

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new CalculatorError("need at least one value")
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new CalculatorError("need at least one value")
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Trading comps: implied EV = target metric × median peer multiple, then walk
 * to equity (− net debt) and per share (÷ diluted shares) when given.
 */
export function compsImpliedValue({
  metric,
  multiples,
  net_debt = 0,
  shares = null,
}: {
  metric: number
  multiples: readonly number[]
  net_debt?: number
  shares?: number | null
}): {
  median_multiple: number
  mean_multiple: number
  implied_ev: number
  implied_equity: number
  implied_share_price: number | null
} {
  const median_multiple = median(multiples)
  const mean_multiple = mean(multiples)
  const implied_ev = metric * median_multiple
  const implied_equity = implied_ev - net_debt
  if (shares != null && shares === 0) throw new CalculatorError("shares must be non-zero")
  return {
    median_multiple,
    mean_multiple,
    implied_ev,
    implied_equity,
    implied_share_price: shares == null ? null : implied_equity / shares,
  }
}
