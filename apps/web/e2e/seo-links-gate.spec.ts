/**
 * SEO link audit (docs/research/seo-geo-plan.md, step 3) against the
 * signed-out "gate" server — what a crawler sees. Crawls "/" and every
 * /guide page, then fails on orphan sitemap pages, pages deeper than
 * MAX_CLICK_DEPTH clicks, and internal links that don't answer 200.
 */
import { expect, test } from "@playwright/test"

import { auditLinks, extractInternalLinks, sitemapPaths, type LinkGraph } from "../lib/seo/link-audit"

const isCrawlable = (path: string) => path === "/" || path === "/guide" || path.startsWith("/guide/")

test("public pages have no orphans, deep pages or broken internal links", async ({ request, baseURL }) => {
  const origin = baseURL!
  const sitemapRes = await request.get("/sitemap.xml")
  expect(sitemapRes.status()).toBe(200)
  const sitemap = sitemapPaths(await sitemapRes.text())
  expect(sitemap.length).toBeGreaterThan(2)

  const graph: LinkGraph = new Map()
  const statuses = new Map<string, number>()
  const queue = ["/"]
  const seen = new Set(queue)

  while (queue.length > 0) {
    const path = queue.shift()!
    const res = await request.get(path, { maxRedirects: 0 })
    statuses.set(path, res.status())
    if (res.status() !== 200) continue
    const links = extractInternalLinks(await res.text(), origin)
    graph.set(path, links)
    for (const link of links) {
      if (seen.has(link)) continue
      seen.add(link)
      if (isCrawlable(link.split("?")[0]!)) {
        queue.push(link)
      } else {
        const target = await request.get(link, { maxRedirects: 0 })
        statuses.set(link, target.status())
      }
    }
  }

  const report = auditLinks({ graph, sitemap, statuses })
  expect(report.broken, "internal links that are not 200 (404s or login redirects)").toEqual([])
  expect(report.orphans, "sitemap pages no public page links to").toEqual([])
  expect(report.tooDeep, "sitemap pages too many clicks from home").toEqual([])
})
