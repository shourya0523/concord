/** Unlevered FCF ≈ EBIT(1−t) + D&A − CapEx − ΔNWC. Parity: calculators.py `ufcf`. */
export function ufcf({
  ebit,
  tax_rate,
  da = 0,
  capex = 0,
  delta_nwc = 0,
}: {
  ebit: number
  tax_rate: number
  da?: number
  capex?: number
  delta_nwc?: number
}): number {
  return ebit * (1.0 - tax_rate) + da - capex - delta_nwc
}
