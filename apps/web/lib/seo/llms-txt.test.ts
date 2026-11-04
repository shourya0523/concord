import assert from "node:assert/strict"
import test from "node:test"

import { buildLlmsTxt } from "./llms-txt"

test("buildLlmsTxt follows the llms.txt shape: H1, summary quote, H2 link lists", () => {
  const text = buildLlmsTxt({
    base: "https://concord.test",
    research: [{ title: "Most-asked topics", path: "/guide/research/x", note: "shares" }],
    concepts: [{ title: "DCF and WACC", path: "/guide/concepts/dcf-wacc", note: "Forecast\n  cash flow." }],
    modules: [],
    firms: [{ title: "Goldman Sachs interview prep", path: "/guide/firms/goldman-sachs" }],
  })
  const lines = text.split("\n")
  assert.equal(lines[0], "# Concord")
  assert.ok(lines[2]!.startsWith("> "))
  assert.ok(text.includes("## Research\n\n- [Most-asked topics](https://concord.test/guide/research/x): shares"))
  assert.ok(text.includes("- [DCF and WACC](https://concord.test/guide/concepts/dcf-wacc): Forecast cash flow."))
  assert.ok(text.includes("- [Goldman Sachs interview prep](https://concord.test/guide/firms/goldman-sachs)\n"))
  assert.ok(!text.includes("## Study modules"), "empty sections are skipped")
  assert.ok(text.includes("## Optional"))
})
