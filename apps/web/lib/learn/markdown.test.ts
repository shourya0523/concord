import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { inlineText, isSafeHref, parseInline, parseMarkdown } from "./markdown"

describe("parseMarkdown", () => {
  it("parses headings, paragraphs, lists, quotes and tables", () => {
    const blocks = parseMarkdown(`## Title

First line
continues here with **bold** and *em* and \`code\`.

- one
- two

1. alpha
2. beta

> EV = equity value + net debt

| A | B |
| --- | --- |
| 1 | 2 |
| 3 |
`)
    assert.deepEqual(
      blocks.map((block) => block.type),
      ["heading", "paragraph", "list", "list", "quote", "table"],
    )
    const paragraph = blocks[1]
    assert.equal(paragraph?.type, "paragraph")
    if (paragraph?.type === "paragraph") {
      assert.equal(
        inlineText(paragraph.children),
        "First line continues here with bold and em and code.",
      )
      assert.ok(paragraph.children.some((node) => node.type === "strong"))
      assert.ok(paragraph.children.some((node) => node.type === "em"))
      assert.ok(paragraph.children.some((node) => node.type === "code"))
    }
    const ordered = blocks[3]
    assert.ok(ordered?.type === "list" && ordered.ordered && ordered.items.length === 2)
    const table = blocks[5]
    assert.ok(table?.type === "table")
    if (table?.type === "table") {
      assert.equal(table.header.length, 2)
      assert.equal(table.rows.length, 2)
      assert.equal(table.rows[1]!.length, 2, "short rows are padded to header width")
    }
  })

  it("never produces raw HTML and drops unsafe links", () => {
    const nodes = parseInline("<script>alert(1)</script> [x](javascript:alert(1)) [ok](https://example.com)")
    assert.equal(nodes[0]?.type, "text")
    assert.ok(inlineText(nodes).includes("<script>"), "HTML stays literal text")
    const links = nodes.filter((node) => node.type === "link")
    assert.equal(links.length, 1)
    assert.equal(links[0]?.type === "link" && links[0].href, "https://example.com")
    assert.equal(isSafeHref("/learn/dcf-wacc"), true)
    assert.equal(isSafeHref("//evil.example"), false)
    assert.equal(isSafeHref("data:text/html,hi"), false)
  })

  it("treats multiplication-style asterisks and lone symbols as text", () => {
    assert.equal(inlineText(parseInline("2 * 3 = 6 and 10%")), "2 * 3 = 6 and 10%")
  })
})
