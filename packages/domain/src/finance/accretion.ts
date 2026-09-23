import { CalculatorError } from "./errors.js"

/** Accretion/(dilution) = combined EPS / stand-alone − 1. Parity: `accretion_dilution`. */
export function accretionDilution({
  acquirer_eps,
  combined_eps,
}: {
  acquirer_eps: number
  combined_eps: number
}): { eps_delta: number; accretive: number } {
  if (acquirer_eps === 0) throw new CalculatorError("acquirer_eps must be non-zero")
  const delta = combined_eps / acquirer_eps - 1.0
  return { eps_delta: delta, accretive: delta > 0 ? 1.0 : 0.0 }
}

/**
 * Pro-forma EPS for a simple merger: combined net income less the after-tax
 * cost of new debt and forgone interest on cash, over the enlarged share count.
 */
export function proFormaEps({
  acquirer_net_income,
  target_net_income,
  acquirer_shares,
  new_shares = 0,
  new_debt = 0,
  interest_rate = 0,
  cash_used = 0,
  cash_yield = 0,
  tax_rate,
}: {
  acquirer_net_income: number
  target_net_income: number
  acquirer_shares: number
  new_shares?: number
  new_debt?: number
  interest_rate?: number
  cash_used?: number
  cash_yield?: number
  tax_rate: number
}): { after_tax_cost: number; combined_net_income: number; combined_shares: number; combined_eps: number } {
  const after_tax_cost = (new_debt * interest_rate + cash_used * cash_yield) * (1 - tax_rate)
  const combined_net_income = acquirer_net_income + target_net_income - after_tax_cost
  const combined_shares = acquirer_shares + new_shares
  if (combined_shares === 0) throw new CalculatorError("combined shares must be non-zero")
  return {
    after_tax_cost,
    combined_net_income,
    combined_shares,
    combined_eps: combined_net_income / combined_shares,
  }
}
