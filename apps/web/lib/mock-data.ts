/**
 * Mock product data typed against @ibpe/contracts.
 * Replace with BFF/API once backend routes land — do not call Glassdoor from the browser.
 */
import type {
  Concept,
  Firm,
  LearningResource,
  PseudoRagPack,
  TopicHeat,
} from "@ibpe/contracts"
import type { HeatLevel } from "@ibpe/ui/lib/tokens"
import type { TopicHeatCell } from "@ibpe/ui/components/topic-heatmap"
import type { TargetCompany } from "@ibpe/ui/components/target-company-multi-select"
import type { ResourceLink } from "@ibpe/ui/components/resource-link-list"
import type { CitationProvenance } from "@ibpe/ui/components/pseudo-rag-citation-card"

export const FIRMS: Firm[] = [
  {
    id: "firm_gs",
    name: "Goldman Sachs",
    slug: "goldman-sachs",
    aliases: ["GS", "Goldman"],
    tracks: ["IB"],
    industry: "Investment banking",
    geographies: ["US", "EMEA"],
    strategies: [],
    metadata: {},
  },
  {
    id: "firm_ms",
    name: "Morgan Stanley",
    slug: "morgan-stanley",
    aliases: ["MS"],
    tracks: ["IB"],
    industry: "Investment banking",
    geographies: ["US"],
    strategies: [],
    metadata: {},
  },
  {
    id: "firm_bx",
    name: "Blackstone",
    slug: "blackstone",
    aliases: ["BX"],
    tracks: ["PE"],
    industry: "Private equity",
    geographies: ["US", "EMEA"],
    strategies: ["buyout", "credit"],
    metadata: {},
  },
  {
    id: "firm_kkr",
    name: "KKR",
    slug: "kkr",
    aliases: [],
    tracks: ["PE"],
    industry: "Private equity",
    geographies: ["US", "APAC"],
    strategies: ["buyout"],
    metadata: {},
  },
  {
    id: "firm_ev",
    name: "Evercore",
    slug: "evercore",
    aliases: [],
    tracks: ["IB"],
    industry: "Boutique advisory",
    geographies: ["US"],
    strategies: [],
    metadata: {},
  },
]

export const TARGET_COMPANIES: TargetCompany[] = FIRMS.map((f) => ({
  id: f.id,
  name: f.name,
  track: f.tracks[0],
}))

export const DEFAULT_TARGET_IDS = ["firm_gs", "firm_bx"]

export const TOPICS: { id: string; label: string }[] = [
  { id: "topic_lbo", label: "LBO" },
  { id: "topic_dcf", label: "DCF" },
  { id: "topic_ma", label: "M&A" },
  { id: "topic_acct", label: "Accounting" },
  { id: "topic_beh", label: "Behavioural" },
]

/** Weak topics for the mock learner — auto-focus UX. */
export const WEAK_TOPICS: { id: string; label: string; severity: "low" | "medium" | "high" }[] = [
  { id: "topic_dcf", label: "DCF", severity: "high" },
  { id: "topic_acct", label: "Accounting", severity: "medium" },
  { id: "topic_lbo", label: "LBO returns", severity: "medium" },
]

/** Contract-shaped heat rows (0–1 intensity). */
export const TOPIC_HEAT: TopicHeat[] = [
  { firm_id: "firm_gs", topic_id: "topic_lbo", intensity: 0.55, sample_size: 42, method: "glassdoor_occurrence" },
  { firm_id: "firm_gs", topic_id: "topic_dcf", intensity: 0.9, sample_size: 61, method: "glassdoor_occurrence" },
  { firm_id: "firm_gs", topic_id: "topic_ma", intensity: 0.7, sample_size: 48, method: "glassdoor_occurrence" },
  { firm_id: "firm_gs", topic_id: "topic_acct", intensity: 0.85, sample_size: 55, method: "glassdoor_occurrence" },
  { firm_id: "firm_gs", topic_id: "topic_beh", intensity: 0.4, sample_size: 30, method: "glassdoor_occurrence" },
  { firm_id: "firm_ms", topic_id: "topic_lbo", intensity: 0.35, sample_size: 22, method: "glassdoor_occurrence" },
  { firm_id: "firm_ms", topic_id: "topic_dcf", intensity: 0.75, sample_size: 40, method: "glassdoor_occurrence" },
  { firm_id: "firm_ms", topic_id: "topic_ma", intensity: 0.95, sample_size: 70, method: "glassdoor_occurrence" },
  { firm_id: "firm_ms", topic_id: "topic_acct", intensity: 0.6, sample_size: 33, method: "glassdoor_occurrence" },
  { firm_id: "firm_ms", topic_id: "topic_beh", intensity: 0.5, sample_size: 28, method: "glassdoor_occurrence" },
  { firm_id: "firm_bx", topic_id: "topic_lbo", intensity: 0.98, sample_size: 80, method: "glassdoor_occurrence" },
  { firm_id: "firm_bx", topic_id: "topic_dcf", intensity: 0.45, sample_size: 25, method: "glassdoor_occurrence" },
  { firm_id: "firm_bx", topic_id: "topic_ma", intensity: 0.3, sample_size: 18, method: "glassdoor_occurrence" },
  { firm_id: "firm_bx", topic_id: "topic_acct", intensity: 0.5, sample_size: 20, method: "glassdoor_occurrence" },
  { firm_id: "firm_bx", topic_id: "topic_beh", intensity: 0.55, sample_size: 24, method: "glassdoor_occurrence" },
  { firm_id: "firm_kkr", topic_id: "topic_lbo", intensity: 0.92, sample_size: 65, method: "glassdoor_occurrence" },
  { firm_id: "firm_kkr", topic_id: "topic_dcf", intensity: 0.4, sample_size: 19, method: "glassdoor_occurrence" },
  { firm_id: "firm_kkr", topic_id: "topic_ma", intensity: 0.35, sample_size: 16, method: "glassdoor_occurrence" },
  { firm_id: "firm_kkr", topic_id: "topic_acct", intensity: 0.45, sample_size: 17, method: "glassdoor_occurrence" },
  { firm_id: "firm_kkr", topic_id: "topic_beh", intensity: 0.48, sample_size: 21, method: "glassdoor_occurrence" },
  { firm_id: "firm_ev", topic_id: "topic_lbo", intensity: 0.25, sample_size: 12, method: "glassdoor_occurrence" },
  { firm_id: "firm_ev", topic_id: "topic_dcf", intensity: 0.65, sample_size: 28, method: "glassdoor_occurrence" },
  { firm_id: "firm_ev", topic_id: "topic_ma", intensity: 0.88, sample_size: 52, method: "glassdoor_occurrence" },
  { firm_id: "firm_ev", topic_id: "topic_acct", intensity: 0.55, sample_size: 23, method: "glassdoor_occurrence" },
  { firm_id: "firm_ev", topic_id: "topic_beh", intensity: 0.6, sample_size: 26, method: "glassdoor_occurrence" },
]

export function intensityToHeatLevel(intensity: number): HeatLevel {
  if (intensity <= 0) return 0
  if (intensity < 0.25) return 1
  if (intensity < 0.5) return 2
  if (intensity < 0.75) return 3
  return 4
}

export function getFirm(slugOrId: string): Firm | undefined {
  return FIRMS.find((f) => f.slug === slugOrId || f.id === slugOrId)
}

export function buildHeatCells(firmIds: string[]): TopicHeatCell[] {
  const weakSet = new Set(WEAK_TOPICS.map((w) => w.id))
  const firmMap = new Map(FIRMS.map((f) => [f.id, f]))
  const topicMap = new Map(TOPICS.map((t) => [t.id, t]))

  return TOPIC_HEAT.filter((h) => firmIds.includes(h.firm_id)).map((h) => {
    const firm = firmMap.get(h.firm_id)!
    const topic = topicMap.get(h.topic_id)!
    return {
      firmId: h.firm_id,
      firmLabel: firm.aliases[0] ?? firm.name,
      topicId: h.topic_id,
      topicLabel: topic.label,
      intensity: intensityToHeatLevel(h.intensity),
      weak: weakSet.has(h.topic_id),
      count: h.sample_size,
    }
  })
}

export function heatFirms(firmIds: string[]) {
  return FIRMS.filter((f) => firmIds.includes(f.id)).map((f) => ({
    id: f.id,
    label: f.aliases[0] ?? f.name,
  }))
}

export const CONCEPTS: Concept[] = [
  {
    id: "concept_lbo",
    slug: "leveraged-buyouts",
    title: "Leveraged buyouts",
    prerequisites: ["concept_acct"],
    firm_relevance: { firm_bx: 0.98, firm_kkr: 0.95, firm_gs: 0.4 },
    domain: "pe",
    summary: "Sources & uses, debt schedule, returns to equity at exit.",
  },
  {
    id: "concept_dcf",
    slug: "dcf-valuation",
    title: "DCF valuation",
    prerequisites: ["concept_acct"],
    firm_relevance: { firm_gs: 0.9, firm_ms: 0.8, firm_ev: 0.7 },
    domain: "both",
    summary: "Unlevered free cash flow, WACC build-up, terminal value.",
  },
  {
    id: "concept_3stmt",
    slug: "three-statement-linkages",
    title: "Three-statement linkages",
    prerequisites: [],
    firm_relevance: { firm_gs: 0.85, firm_ms: 0.8 },
    domain: "ib",
    summary: "How IS, BS, and CFS articulate and constrain each other.",
  },
  {
    id: "concept_ev",
    slug: "enterprise-to-equity",
    title: "Enterprise value → equity value",
    prerequisites: ["concept_acct"],
    firm_relevance: { firm_gs: 0.75, firm_ms: 0.7, firm_ev: 0.8 },
    domain: "ib",
    summary: "Bridge from EV to equity via net debt and other claims.",
  },
]

export function getConcept(slugOrId: string): Concept | undefined {
  return CONCEPTS.find((c) => c.slug === slugOrId || c.id === slugOrId)
}

export const RESOURCES: LearningResource[] = [
  {
    id: "res_lbo_internal",
    label: "LBO returns sketch",
    url: "https://example.com/internal/lbo-returns",
    kind: "internal",
    provenance: "editorial",
    concept_ids: ["concept_lbo"],
    firm_ids: ["firm_bx", "firm_kkr"],
  },
  {
    id: "res_damodaran",
    label: "Damodaran — cost of capital",
    url: "https://pages.stern.nyu.edu/~adamodar/",
    kind: "external",
    provenance: "editorial",
    concept_ids: ["concept_dcf"],
    firm_ids: [],
  },
  {
    id: "res_3stmt",
    label: "Statement articulation drill",
    url: "https://example.com/internal/3stmt",
    kind: "internal",
    provenance: "static_seed",
    concept_ids: ["concept_3stmt"],
    firm_ids: [],
  },
]

export function resourcesForConcept(conceptId: string): ResourceLink[] {
  return RESOURCES.filter((r) => r.concept_ids.includes(conceptId)).map((r) => ({
    id: r.id,
    label: r.label,
    href: r.url,
    kind: r.kind,
    description: `Provenance · ${r.provenance}`,
  }))
}

export type RagCitationView = {
  id: string
  title: string
  excerpt: string
  whyRetrieved: string
  provenance: CitationProvenance
  sourceUrl?: string
  score: number
}

export const RAG_CITATIONS: RagCitationView[] = [
  {
    id: "q_lbo_walk",
    title: "Walk me through an LBO",
    excerpt: "Sources and uses, debt schedule, and returns to equity at exit.",
    whyRetrieved: "High heat at Blackstone × weak topic LBO; teaching corpus confidence 0.94.",
    provenance: "github-corpus",
    score: 0.94,
  },
  {
    id: "q_dcf_wacc",
    title: "How do you build WACC?",
    excerpt: "Cost of equity via CAPM, after-tax cost of debt, target capital structure weights.",
    whyRetrieved: "Intersection of Goldman DCF heat and your DCF weakness.",
    provenance: "github-corpus",
    score: 0.91,
  },
  {
    id: "sig_gs_acct",
    title: "Accounting drill signal — Goldman",
    excerpt: "Reported interviews frequently stress working-capital and deferred-tax bridges.",
    whyRetrieved: "Firm occurrence signal only — not a teaching answer. Routes you to corpus Q/A.",
    provenance: "glassdoor-signal",
    score: 0.72,
  },
  {
    id: "q_3stmt",
    title: "How do the three statements link?",
    excerpt: "Net income flows to CFS and retained earnings; CFS updates cash on the BS.",
    whyRetrieved: "Prerequisite for DCF FCF build; marked weak on Accounting.",
    provenance: "gemini-enriched",
    score: 0.83,
  },
]

export const MOCK_RAG_PACK: PseudoRagPack = {
  query: "Prepare me for GS + BX technicals focusing on weak DCF / LBO",
  firm_ids: DEFAULT_TARGET_IDS,
  item_ids: RAG_CITATIONS.map((c) => c.id),
  scores: RAG_CITATIONS.map((c) => c.score),
  citations: RAG_CITATIONS.map((c) => ({
    item_id: c.id,
    provenance:
      c.provenance === "github-corpus"
        ? "github_source"
        : c.provenance === "glassdoor-signal"
          ? "glassdoor_occurrence"
          : c.provenance === "gemini-enriched"
            ? "gemini_synthesised"
            : "editorial",
    label: c.title,
  })),
  frozen_at: "2026-07-30T00:00:00.000Z",
}

export const DIAGRAM_SOURCES: Record<string, { title: string; mermaid: string; a11y: string }> = {
  "leveraged-buyouts": {
    title: "Sources & uses",
    mermaid: `flowchart LR
  Equity[Sponsor equity] --> HoldCo
  Debt[Debt facilities] --> HoldCo
  HoldCo --> Target[Target equity]
  Target --> Uses[Refinance + fees]`,
    a11y:
      "Sources: sponsor equity and debt facilities fund HoldCo. Uses: acquire target equity, refinance existing debt, and pay transaction fees.",
  },
  "dcf-valuation": {
    title: "DCF / WACC build-up",
    mermaid: `flowchart TB
  FCF[Unlevered FCF] --> PV[Present value]
  WACC[WACC] --> PV
  TV[Terminal value] --> EV[Enterprise value]
  PV --> EV
  EV --> Eq[Equity value]`,
    a11y:
      "Unlevered free cash flows and terminal value are discounted at WACC to enterprise value, then bridged to equity value.",
  },
  "three-statement-linkages": {
    title: "Three-statement linkages",
    mermaid: `flowchart TB
  IS[Income statement] -->|Net income| CFS[Cash flow statement]
  IS -->|Retained earnings| BS[Balance sheet]
  CFS -->|Cash| BS`,
    a11y:
      "Net income flows from the income statement into the cash flow statement and retained earnings on the balance sheet. Ending cash from the CFS updates the balance sheet cash line.",
  },
  "enterprise-to-equity": {
    title: "EV → equity bridge",
    mermaid: `flowchart LR
  EV[Enterprise value] --> ND[Less net debt]
  ND --> NCI[Less NCI / prefs]
  NCI --> Eq[Equity value]`,
    a11y:
      "Start with enterprise value, subtract net debt and other claims such as NCI or preferred stock to arrive at equity value.",
  },
}
