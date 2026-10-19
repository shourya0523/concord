export type NwcBalances = {
  receivables: number
  inventory: number
  payables: number
  /** Other operating current assets (prepaids). */
  other_current_assets?: number
  /** Other operating current liabilities (accrued expenses, deferred revenue). */
  accrued_liabilities?: number
}

/** Operating NWC = AR + inventory + other CA − AP − accrued (cash and debt excluded). */
export function operatingNwc(b: NwcBalances): number {
  return (
    b.receivables +
    b.inventory +
    (b.other_current_assets ?? 0) -
    b.payables -
    (b.accrued_liabilities ?? 0)
  )
}

/**
 * Change in NWC between two balance sheets. An increase in NWC is a use of
 * cash, so `cash_impact = −delta_nwc` (this is the ΔNWC in UFCF).
 */
export function nwcChange({
  begin,
  end,
}: {
  begin: NwcBalances
  end: NwcBalances
}): { nwc_begin: number; nwc_end: number; delta_nwc: number; cash_impact: number } {
  const nwc_begin = operatingNwc(begin)
  const nwc_end = operatingNwc(end)
  const delta_nwc = nwc_end - nwc_begin
  return { nwc_begin, nwc_end, delta_nwc, cash_impact: -delta_nwc }
}

/** Balance from a days metric: AR = revenue·DSO/365, inventory = COGS·DIO/365, AP = COGS·DPO/365. */
export function balanceFromDays(flow: number, days: number, daysInYear = 365): number {
  return (flow * days) / daysInYear
}
