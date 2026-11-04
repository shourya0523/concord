/**
 * Read-only content for the public, crawlable guide (/guide/*) and the
 * sitemap. Only content Concord owns or has cleared (concept explainers,
 * module outlines, firm names and aggregate topic heat) — never raw scraped
 * question or answer text (docs/research/seo-geo-plan.md, "Content rights").
 */
import { getFirmBySlugOrId, listFirmCatalog, type FirmCatalogItem } from "@/lib/data/catalog"
import { getFirmTopicHeat } from "@/lib/data/firms"
import { getMultiFirmHeat } from "@/lib/data/prep"
import { getConceptDetail, getLearningModule, listConcepts, listLearningModules } from "@/lib/data/learning"
import { withNext } from "@/lib/auth/gate"

export const GUIDE_PATH = "/guide"

export const guidePaths = {
  hub: GUIDE_PATH,
  concept: (slug: string) => `${GUIDE_PATH}/concepts/${slug}`,
  module: (slug: string) => `${GUIDE_PATH}/modules/${slug}`,
  firm: (slug: string) => `${GUIDE_PATH}/firms/${slug}`,
  topicFrequency: `${GUIDE_PATH}/research/most-asked-interview-topics`,
}

/** Sign-up link that lands the new user on the in-app version of a page. */
export function signUpFor(appPath: string): string {
  return withNext("/sign-up", appPath)
}

export async function publicConcepts() {
  return (await listConcepts()).items.map((item) => item.concept)
}

export async function publicModules() {
  return (await listLearningModules()).items
}

/** Firms with at least one interview signal (empty rooms make thin pages). */
export async function publicFirms(): Promise<FirmCatalogItem[]> {
  return (await listFirmCatalog()).items.filter((firm) => firm.signals > 0)
}

export async function publicConcept(slug: string) {
  const [detail, concepts, modules, firms] = await Promise.all([
    getConceptDetail(slug),
    publicConcepts(),
    publicModules(),
    listFirmCatalog(),
  ])
  if (!detail || detail.item.concept.slug !== slug) return null
  const { concept, topic, diagrams } = detail.item
  const byId = new Map(concepts.map((c) => [c.id, c]))
  const parentModule = modules.find((m) => m.concept_ids.includes(concept.id)) ?? null
  const prerequisites = concept.prerequisites.flatMap((id) => byId.get(id) ?? [])
  const related = parentModule
    ? parentModule.concept_ids.filter((id) => id !== concept.id).flatMap((id) => byId.get(id) ?? [])
    : []
  const firmIndex = new Map<string, FirmCatalogItem>()
  for (const firm of firms.items) {
    firmIndex.set(firm.id, firm)
    firmIndex.set(firm.slug, firm)
  }
  const askedAt = Object.entries(concept.firm_relevance)
    .filter(([, intensity]) => intensity >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .flatMap(([firmId]) => firmIndex.get(firmId) ?? [])
  return { concept, topic, diagram: diagrams[0] ?? null, parentModule, prerequisites, related, askedAt }
}

export async function publicModule(slug: string) {
  const [detail, concepts, modules] = await Promise.all([getLearningModule(slug), publicConcepts(), publicModules()])
  if (!detail || detail.module.slug !== slug) return null
  const learningModule = detail.module
  const byId = new Map(concepts.map((c) => [c.id, c]))
  const moduleById = new Map(modules.map((m) => [m.id, m]))
  const index = modules.findIndex((m) => m.id === learningModule.id)
  return {
    prerequisiteModules: learningModule.prereq_module_ids.flatMap((id) => moduleById.get(id) ?? []),
    nextModule: index >= 0 ? (modules[index + 1] ?? null) : null,
    module: learningModule,
    concepts: learningModule.concept_ids.flatMap((id) => byId.get(id) ?? []),
    checkpoints: [...detail.checkpoints].sort((a, b) => a.position - b.position),
  }
}

export async function publicFirm(slug: string) {
  const [firm, concepts] = await Promise.all([getFirmBySlugOrId(slug), publicConcepts()])
  if (!firm || firm.slug !== slug || firm.signals === 0) return null
  // Reverse of the concept → firm bridge: concepts this firm leans on.
  const relevant = concepts
    .map((concept) => ({
      concept,
      intensity: concept.firm_relevance[firm.id] ?? concept.firm_relevance[firm.slug] ?? 0,
    }))
    .filter((entry) => entry.intensity >= 0.5)
    .sort((a, b) => b.intensity - a.intensity)
    .map((entry) => entry.concept)
  let topics: Array<{ topic: string; intensity: number; sampleSize: number }> = []
  try {
    const heat = await getFirmTopicHeat(firm.id)
    topics = heat.topics.map((t) => ({ topic: t.topic_id, intensity: t.intensity, sampleSize: t.sample_size }))
  } catch (err) {
    console.warn("[guide] firm heat read failed", err)
  }
  return { firm, topics, relevantConcepts: relevant, coreConcepts: concepts }
}

/** A firm "asks a topic often" when it has at least this many reports on it. */
export const FIRM_TOPIC_MIN_REPORTS = 10

export type TopicFrequencyRow = {
  topic: string
  /** Tagged interview reports on this topic, across all firms. */
  reports: number
  /** Share of all tagged reports (0–1). */
  share: number
  /** Firms with at least FIRM_TOPIC_MIN_REPORTS reports on this topic. */
  firmsAskingOften: number
}

export type TopicFrequency = {
  rows: TopicFrequencyRow[]
  firmCount: number
  taggedReports: number
  totalReports: number
  /** Top technical (non-behavioural) topic per firm, biggest firms first. */
  byFirm: Array<{ firm: FirmCatalogItem; topic: string; share: number }>
}

/**
 * Original-data piece (SEO/GEO plan step 4): which technical topics IB and PE
 * interviews ask most, aggregated across every firm in the catalog. Counts
 * only — no question text.
 */
export async function topicFrequency(): Promise<TopicFrequency> {
  const firms = await publicFirms()
  const empty: TopicFrequency = { rows: [], firmCount: firms.length, taggedReports: 0, totalReports: 0, byFirm: [] }
  if (firms.length === 0) return empty
  let heat
  try {
    heat = await getMultiFirmHeat(firms.map((firm) => firm.id))
  } catch (err) {
    console.warn("[guide] topic frequency read failed", err)
    return empty
  }
  const tagged = heat.topics.filter((row) => row.topic_id !== "untagged" && row.sample_size > 0)
  const totals = new Map<string, { reports: number; often: number }>()
  const perFirm = new Map<string, Map<string, number>>()
  for (const row of tagged) {
    const total = totals.get(row.topic_id) ?? { reports: 0, often: 0 }
    total.reports += row.sample_size
    if (row.sample_size >= FIRM_TOPIC_MIN_REPORTS) total.often += 1
    totals.set(row.topic_id, total)
    const firmTopics = perFirm.get(row.firm_id) ?? new Map<string, number>()
    firmTopics.set(row.topic_id, (firmTopics.get(row.topic_id) ?? 0) + row.sample_size)
    perFirm.set(row.firm_id, firmTopics)
  }
  const taggedReports = [...totals.values()].reduce((sum, total) => sum + total.reports, 0)
  const rows = [...totals.entries()]
    .map(([topic, total]) => ({
      topic,
      reports: total.reports,
      share: taggedReports ? total.reports / taggedReports : 0,
      firmsAskingOften: total.often,
    }))
    .sort((a, b) => b.reports - a.reports || a.topic.localeCompare(b.topic))
  const byFirm = firms.flatMap((firm) => {
    const technical = [...(perFirm.get(firm.id) ?? new Map<string, number>()).entries()].filter(
      ([topic]) => topic !== "behavioral",
    )
    if (technical.length === 0) return []
    const firmTotal = technical.reduce((sum, [, n]) => sum + n, 0)
    const [topic, count] = technical.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!
    return [{ firm, topic, share: firmTotal ? count / firmTotal : 0 }]
  })
  return {
    rows,
    firmCount: firms.length,
    taggedReports,
    totalReports: firms.reduce((sum, firm) => sum + firm.signals, 0),
    byFirm,
  }
}
