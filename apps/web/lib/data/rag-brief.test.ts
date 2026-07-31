import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildTemplateRagBrief, validateCitedBrief } from "./rag-brief"

const items = [
  {
    id: "acc-001",
    title: "Walk through depreciation across the statements",
    snippet:
      "Depreciation lowers EBIT, taxes, and net income while cash flow adds it back.",
  },
  {
    id: "lbo-002",
    title: "Paper LBO return drivers",
    snippet:
      "Entry multiple, leverage, debt paydown, EBITDA growth, and exit multiple drive returns.",
  },
]

describe("RAG brief citation guard", () => {
  it("keeps only claims citing retrieved pack item ids", () => {
    const validated = validateCitedBrief(
      "Prioritize accounting mechanics for the opening technical screen [acc-001]. Goldman always asks this uncited claim. Then drill LBO return drivers [lbo-002]. Ignore this fake citation [missing].",
      items
    )

    assert.ok(validated)
    assert.equal(
      validated.brief,
      "Prioritize accounting mechanics for the opening technical screen [acc-001]. Then drill LBO return drivers [lbo-002]."
    )
    assert.deepEqual(validated.citation_ids, ["acc-001", "lbo-002"])
  })

  it("rejects uncited generated text", () => {
    assert.equal(
      validateCitedBrief("Goldman always asks accounting and LBOs.", items),
      null
    )
  })

  it("builds a deterministic cited template", () => {
    const result = buildTemplateRagBrief({
      query: "Superday technicals",
      firm_names: ["Goldman Sachs"],
      weak_topics: ["accounting"],
      items,
    })

    assert.equal(result.brief_source, "template")
    assert.ok(result.brief.includes("[acc-001]"))
    assert.deepEqual(
      result.brief_citations.map((citation) => citation.item_id),
      ["acc-001", "lbo-002"]
    )
  })
})
