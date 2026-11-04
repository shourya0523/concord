import type { MetadataRoute } from "next"

import { appBaseUrl } from "@/lib/notify/config"
import { guidePaths, publicConcepts, publicFirms, publicModules } from "@/lib/seo/public-content"

export const revalidate = 3600

/** Every public, indexable URL: landing, guide hub, concepts, modules, firms. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appBaseUrl()
  const [concepts, modules, firms] = await Promise.all([publicConcepts(), publicModules(), publicFirms()])
  const entry = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: `${base}${path}`,
    changeFrequency: "weekly",
    priority,
  })
  return [
    entry("/", 1),
    entry(guidePaths.hub, 0.9),
    ...modules.map((m) => entry(guidePaths.module(m.slug), 0.8)),
    ...concepts.map((c) => entry(guidePaths.concept(c.slug), 0.8)),
    ...firms.map((f) => entry(guidePaths.firm(f.slug), 0.7)),
  ]
}
