import assert from "node:assert/strict"
import test from "node:test"

import { auditLinks, clickDepths, extractInternalLinks, normalisePath, sitemapPaths } from "./link-audit"

const ORIGIN = "https://concord.test"

test("extractInternalLinks keeps same-origin paths only", () => {
  const html = `
    <a href="/guide">Guides</a>
    <a class="x" href="/sign-up?next=%2Fconcepts%2Fdcf&amp;a=1">Go</a>
    <a href="https://concord.test/guide/firms/gs/">GS</a>
    <a href="https://evil.com/x">ext</a>
    <a href="#top">top</a>
    <a href="mailto:a@b.c">mail</a>
    <link href="/style.css">`
  assert.deepEqual(extractInternalLinks(html, ORIGIN), [
    "/guide",
    "/sign-up?next=%2Fconcepts%2Fdcf&a=1",
    "/guide/firms/gs",
  ])
})

test("normalisePath drops the hash and trailing slash", () => {
  assert.equal(normalisePath("/guide/#concepts", ORIGIN), "/guide")
  assert.equal(normalisePath("/", ORIGIN), "/")
  assert.equal(normalisePath("javascript:void(0)", ORIGIN), null)
})

test("sitemapPaths reads <loc> values as paths", () => {
  const xml = "<urlset><url><loc>https://x.app/</loc></url><url><loc>https://x.app/guide/a</loc></url></urlset>"
  assert.deepEqual(sitemapPaths(xml), ["/", "/guide/a"])
})

test("clickDepths is shortest-path BFS from /", () => {
  const graph = new Map([
    ["/", ["/guide"]],
    ["/guide", ["/guide/a", "/guide/b"]],
    ["/guide/a", ["/guide/b", "/guide/c"]],
  ])
  const depths = clickDepths(graph)
  assert.equal(depths.get("/guide/b"), 2)
  assert.equal(depths.get("/guide/c"), 3)
})

test("auditLinks reports orphans, deep pages and broken links", () => {
  const graph = new Map([
    ["/", ["/a"]],
    ["/a", ["/b", "/missing"]],
    ["/b", ["/c"]],
    ["/c", ["/d"]],
  ])
  const report = auditLinks({
    graph,
    sitemap: ["/", "/a", "/d", "/orphan"],
    statuses: new Map([
      ["/a", 200],
      ["/missing", 404],
    ]),
    maxDepth: 3,
  })
  assert.deepEqual(report.orphans, ["/orphan"])
  assert.deepEqual(report.tooDeep, [{ path: "/d", depth: 4 }])
  assert.deepEqual(report.broken, [{ from: "/a", to: "/missing", status: 404 }])
})
