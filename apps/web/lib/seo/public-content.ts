/**
 * Read-only content for the public, crawlable guide (/guide/*) and the
 * sitemap. Only content Concord owns or has cleared (concept explainers,
 * module outlines, firm names and aggregate topic heat) — never raw scraped
 * question or answer text (docs/research/seo-geo-plan.md, "Content rights").
 */
import { getFirmBySlugOrId, listFirmCatalog, type FirmCatalogItem } from "@/lib/data/catalog"
import { getFirmTopicHeat } from "@/lib/data/firms"
import { getConceptDetail, getLearningModule, listConcepts, listLearningModules } from "@/lib/data/learning"
import { withNext } from "@/lib/auth/gate"

export const GUIDE_PATH = "/guide"

export const guidePaths = {
  hub: GUIDE_PATH,
  concept: (slug: string) => `${GUIDE_PATH}/concepts/${slug}`,
  module: (slug: string) => `${GUIDE_PATH}/modules/${slug}`,
  firm: (slug: string) => `${GUIDE_PATH}/firms/${slug}`,
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
  const [detail, concepts] = await Promise.all([getLearningModule(slug), publicConcepts()])
  if (!detail || detail.module.slug !== slug) return null
  const learningModule = detail.module
  const byId = new Map(concepts.map((c) => [c.id, c]))
  return {
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
