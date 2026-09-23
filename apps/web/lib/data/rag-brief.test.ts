import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildTemplateRagBrief,
  tryGenerateGroundedRagBrief,
  validateCitedBrief,
} from "./rag-brief"

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

describe("RAG brief rewrite (small tier, mocked OpenRouter)", () => {
  const input = { query: "Superday technicals", firm_names: ["Goldman Sachs"], items }

  it("returns null without OPENROUTER_API_KEY (template path)", async () => {
    let called = false
    const fetchImpl = (async () => {
      called = true
      return new Response("{}")
    }) as typeof fetch
    const result = await tryGenerateGroundedRagBrief(input, {} as NodeJS.ProcessEnv, { fetch: fetchImpl })
    assert.equal(result, null)
    assert.equal(called, false)
  })

  it("accepts a cited rewrite from the small model", async () => {
    let body: Record<string, unknown> = {}
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          model: "deepseek/deepseek-v4-flash",
          choices: [
            {
              message: {
                content:
                  "Open with depreciation across the three statements [acc-001]. Then rehearse paper LBO return drivers [lbo-002].",
              },
            },
          ],
        }),
      )
    }) as typeof fetch
    const result = await tryGenerateGroundedRagBrief(
      input,
      { OPENROUTER_API_KEY: "k", LLM_SMALL_MODEL: "deepseek/deepseek-v4-flash" } as unknown as NodeJS.ProcessEnv,
      { fetch: fetchImpl },
    )
    assert.equal(body.model, "deepseek/deepseek-v4-flash")
    assert.equal(body.models, undefined)
    assert.equal(result?.brief_source, "llm")
    assert.deepEqual(
      result?.brief_citations.map((c) => c.item_id),
      ["acc-001", "lbo-002"],
    )
  })
})
