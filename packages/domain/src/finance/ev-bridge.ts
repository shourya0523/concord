/** Enterprise value bridge: EV = equity + net debt + preferred + NCI. Parity: `ev_bridge`. */
export function evBridge({
  equity_value,
  gross_debt,
  cash,
  preferred = 0,
  nci = 0,
}: {
  equity_value: number
  gross_debt: number
  cash: number
  preferred?: number
  nci?: number
}): { net_debt: number; enterprise_value: number } {
  const net_debt = gross_debt - cash
  const enterprise_value = equity_value + net_debt + preferred + nci
  return { net_debt, enterprise_value }
}

/** Inverse bridge: equity = EV − net debt − preferred − NCI. */
export function equityFromEv({
  enterprise_value,
  gross_debt,
  cash,
  preferred = 0,
  nci = 0,
}: {
  enterprise_value: number
  gross_debt: number
  cash: number
  preferred?: number
  nci?: number
}): { net_debt: number; equity_value: number } {
  const net_debt = gross_debt - cash
  return { net_debt, equity_value: enterprise_value - net_debt - preferred - nci }
}
