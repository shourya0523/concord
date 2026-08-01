/**
 * Topic taxonomy shared by UI + data layer.
 * Slugs match occurrence topic backfill migrations and
 * packages/search/src/topics.ts (keyword_rules_v2).
 */

export const TOPIC_LABELS: Record<string, string> = {
  lbo: "LBO",
  valuation: "Valuation / DCF",
  enterprise_value: "EV ↔ equity",
  accounting: "Accounting",
  working_capital: "Working capital",
  merger_models: "M&A / merger models",
  capital_structure: "Capital structure",
  investment_thesis: "Investment thesis",
  due_diligence: "Due diligence",
  restructuring: "Restructuring",
  credit: "Credit",
  industry_coverage: "Industry / coverage",
  markets: "Markets / macro",
  brainteasers: "Brainteasers",
  returns: "Returns",
  value_creation: "Value creation",
  behavioral: "Behavioural",
  untagged: "General",
}

/** Matrix column order — most interview-central first, catch-all last. */
export const TOPIC_ORDER = [
  "accounting",
  "valuation",
  "enterprise_value",
  "merger_models",
  "lbo",
  "credit",
  "capital_structure",
  "returns",
  "investment_thesis",
  "due_diligence",
  "industry_coverage",
  "markets",
  "value_creation",
  "restructuring",
  "brainteasers",
  "behavioral",
  "untagged",
] as const

export function topicLabel(slug: string): string {
  return TOPIC_LABELS[slug] ?? slug.replace(/_/g, " ")
}

export function sortTopicSlugs(slugs: Iterable<string>): string[] {
  const order = new Map<string, number>(
    TOPIC_ORDER.map((slug, index) => [slug as string, index]),
  )
  return [...slugs].sort(
    (a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99) || a.localeCompare(b),
  )
}

/** concept_id ↔ topic slug (DB convention: concept_<slug with underscores>). */
const CONCEPT_TOPIC: Record<string, string> = {
  concept_accounting_foundations: "accounting",
  concept_ev_equity_value: "enterprise_value",
  concept_dcf_wacc: "valuation",
  concept_lbo_paper_lbo: "lbo",
  concept_behavioural_story: "behavioral",
}

const CONCEPT_SLUG: Record<string, string> = {
  concept_accounting_foundations: "accounting-foundations",
  concept_ev_equity_value: "ev-equity-value",
  concept_dcf_wacc: "dcf-wacc",
  concept_lbo_paper_lbo: "lbo-paper-lbo",
  concept_behavioural_story: "behavioural-story",
}

export function topicForConceptId(conceptId: string): string | null {
  return CONCEPT_TOPIC[conceptId] ?? null
}

export function conceptIdForTopic(topic: string): string | null {
  for (const [conceptId, slug] of Object.entries(CONCEPT_TOPIC)) {
    if (slug === topic) return conceptId
  }
  return null
}

export function conceptSlugForTopic(topic: string): string | null {
  const conceptId = conceptIdForTopic(topic)
  return conceptId ? (CONCEPT_SLUG[conceptId] ?? null) : null
}
