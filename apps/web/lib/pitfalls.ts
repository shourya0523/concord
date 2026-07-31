/**
 * Warren's static pitfall asides per topic — quiet bracket callouts on
 * module hubs and concept labs (bracket = Warren's aside, semantic map).
 */

const PITFALLS: Record<string, string> = {
  accounting:
    "Net income is not cash flow. Depreciation gets added back, and a working-capital swing can flip the sign of the answer — walk the statements in order, never from memory.",
  enterprise_value:
    "The bridge runs through net debt, not gross debt — and preferred equity and minority interest are claims too. Candidates lose points by stopping at cash and debt.",
  valuation:
    "WACC is an opportunity cost, not a negotiating position. Unlever the beta, then relever for the target structure — mixing levered and unlevered figures is the classic slip.",
  lbo: "Returns come from three levers: deleveraging, EBITDA growth, and multiple change. In a paper LBO, say which lever is doing the work before you do the math.",
  behavioral:
    "Stories land on structure: situation, action, result. A result with a number beats a result with an adjective — quantify the outcome.",
}

const DEFAULT_PITFALL =
  "Define every term before you calculate. Most wrong answers here start with a fuzzy definition, not bad arithmetic."

export function pitfallForTopic(topic: string | null): string {
  return (topic ? PITFALLS[topic] : undefined) ?? DEFAULT_PITFALL
}
