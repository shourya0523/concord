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

  const DRAFT =
    "Open with depreciation across the three statements [acc-001]. Then rehearse paper LBO return drivers [lbo-002]."

  /** Routes chat and Decisions calls; `jev` shapes the verification answer (or an HTTP error). */
  function cascadeFetch(jev: { choice?: string; confidence?: number; status?: number }) {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = []
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      calls.push({ url: String(url), body })
      if (String(url).endsWith("/api/alpha/decisions")) {
        if (jev.status) {
          return new Response(JSON.stringify({ error: { code: jev.status, message: "overloaded" } }), {
            status: jev.status,
          })
        }
        return new Response(
          JSON.stringify({
            model: "typesafe/jev-1.13",
            answers: { support: { type: "choice", choice: jev.choice, confidence: jev.confidence } },
            usage: { input_tokens: 200, output_tokens: 3, cost: 0.0000084 },
          }),
        )
      }
      return new Response(
        JSON.stringify({ model: "deepseek/deepseek-v4-flash", choices: [{ message: { content: DRAFT } }] }),
      )
    }) as typeof fetch
    return { fetchImpl, calls }
  }
  const keyEnv = {
    OPENROUTER_API_KEY: "k",
    LLM_SMALL_MODEL: "deepseek/deepseek-v4-flash",
  } as unknown as NodeJS.ProcessEnv

  it("ships a small-model draft only after Jev verifies it as supported", async () => {
    const { fetchImpl, calls } = cascadeFetch({ choice: "supported", confidence: 0.94 })
    const result = await tryGenerateGroundedRagBrief(input, keyEnv, { fetch: fetchImpl })
    assert.equal(calls.length, 2)
    assert.equal(calls[0]!.body.model, "deepseek/deepseek-v4-flash")
    assert.equal(calls[0]!.body.models, undefined)
    assert.equal(calls[1]!.url, "https://openrouter.ai/api/alpha/decisions")
    const state = calls[1]!.body.state as { sources: string[]; request: string; draft: string }
    assert.equal(state.draft, DRAFT)
    assert.match(state.sources[0]!, /^\[acc-001\] Walk through depreciation/)
    assert.match(state.request, /Superday technicals/)
    assert.equal(result?.brief_source, "llm")
    assert.equal(result?.brief_verified, true)
    assert.deepEqual(
      result?.brief_citations.map((c) => c.item_id),
      ["acc-001", "lbo-002"],
    )
  })

  it("falls back to the template when Jev rejects, is unsure, or errors", async () => {
    for (const jev of [
      { choice: "unsupported", confidence: 0.97 },
      { choice: "supported", confidence: 0.6 },
      { choice: "declined", confidence: 0.99 },
      { status: 529 },
    ]) {
      const { fetchImpl } = cascadeFetch(jev)
      const result = await tryGenerateGroundedRagBrief(input, keyEnv, { fetch: fetchImpl })
      assert.equal(result, null, JSON.stringify(jev))
    }
    const template = buildTemplateRagBrief(input)
    assert.equal(template.brief_verified, false)
  })
})
