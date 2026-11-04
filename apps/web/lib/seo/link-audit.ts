/**
 * Internal-link audit for the public site (SEO plan step 3). Pure helpers;
 * e2e/seo-links-gate.spec.ts crawls a signed-out server and feeds them.
 *
 * Rules:
 * - every sitemap URL is reachable from "/" by following links (no orphans)
 * - every sitemap URL is at most MAX_CLICK_DEPTH clicks from "/"
 * - every internal link on a public page answers 200 (no 404s, no redirects
 *   into the login gate)
 */

export const MAX_CLICK_DEPTH = 3

/** Internal hrefs from an HTML page, as normalised paths ("/guide/x"). */
export function extractInternalLinks(html: string, origin: string): string[] {
  const out = new Set<string>()
  for (const match of html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/gi)) {
    const path = normalisePath(decodeEntities(match[1] ?? ""), origin)
    if (path) out.add(path)
  }
  return [...out]
}

/** Same-origin path with query kept and hash dropped; null for external/other schemes. */
export function normalisePath(href: string, origin: string): string | null {
  if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) return null
  let url: URL
  try {
    url = new URL(href, origin)
  } catch {
    return null
  }
  if (url.origin !== new URL(origin).origin) return null
  const path = url.pathname.replace(/\/+$/, "") || "/"
  return `${path}${url.search}`
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&quot;/g, '"')
}

/** Sitemap <loc> values as paths. */
export function sitemapPaths(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!.trim()).pathname.replace(/\/+$/, "") || "/")
}

export type LinkGraph = Map<string, string[]>

/** Click depth of every page reachable from `start` (BFS). */
export function clickDepths(graph: LinkGraph, start = "/"): Map<string, number> {
  const depth = new Map<string, number>([[start, 0]])
  const queue = [start]
  while (queue.length > 0) {
    const page = queue.shift()!
    for (const next of graph.get(page) ?? []) {
      if (!depth.has(next)) {
        depth.set(next, depth.get(page)! + 1)
        queue.push(next)
      }
    }
  }
  return depth
}

export type LinkAuditReport = {
  orphans: string[]
  tooDeep: Array<{ path: string; depth: number }>
  broken: Array<{ from: string; to: string; status: number }>
}

export function auditLinks(options: {
  graph: LinkGraph
  sitemap: string[]
  statuses: Map<string, number>
  maxDepth?: number
}): LinkAuditReport {
  const maxDepth = options.maxDepth ?? MAX_CLICK_DEPTH
  const depths = clickDepths(options.graph)
  const orphans = options.sitemap.filter((path) => !depths.has(path))
  const tooDeep = options.sitemap.flatMap((path) => {
    const depth = depths.get(path)
    return depth !== undefined && depth > maxDepth ? [{ path, depth }] : []
  })
  const broken: LinkAuditReport["broken"] = []
  for (const [from, links] of options.graph) {
    for (const to of links) {
      const status = options.statuses.get(to)
      if (status !== undefined && status !== 200) broken.push({ from, to, status })
    }
  }
  return { orphans, tooDeep, broken }
}
