import assert from "node:assert/strict"
import { describe, it } from "node:test"

// No DATABASE_URL: exercises the built-in curriculum fallback.
delete process.env.DATABASE_URL

const learning = await import("./learning")

describe("learning data (no-DB curriculum fallback)", () => {
  it("lists all 8 modules in curriculum order", async () => {
    const result = await learning.listLearningModules()
    assert.equal(result.source, "stub")
    assert.deepEqual(
      result.items.map((m) => m.slug),
      [
        "accounting-foundations",
        "ev-equity-value",
        "valuation-comps",
        "dcf-wacc",
        "lbo-paper-lbo",
        "merger-model",
        "pe-fund-mechanics",
        "behavioural-story",
      ],
    )
    for (const item of result.items) {
      for (const checkpoint of item.checkpoints) {
        assert.ok(checkpoint.question_ids.length >= 3, checkpoint.id)
      }
    }
  })

  it("serves lesson bodies and quiz metadata for a module", async () => {
    const content = await learning.getModuleCheckpointContent("module_accounting_foundations")
    assert.ok((content.get("chk_accounting_lesson")?.body_markdown ?? "").length > 1000)
    assert.equal(content.get("chk_accounting_da_quiz")?.metadata.mode, "quiz")
  })

  it("resolves interactive and mermaid diagram assets by id", async () => {
    const assets = await learning.getDiagramAssetsByIds(["diag_quiz_ev_bridge", "diag_ddm", "nope"])
    assert.equal(assets.get("diag_quiz_ev_bridge")?.ref.format, "interactive-json")
    assert.equal(assets.get("diag_ddm")?.ref.format, "mermaid")
    assert.equal(assets.has("nope"), false)
  })

  it("lists diagrams for a question from the generated links, then rules by topic", async () => {
    const linked = await learning.listDiagramsForQuestion("cq_c4c3acddbefa4fea")
    assert.ok(linked.length > 0)
    assert.ok(linked.some((d) => d.ref.id === "diag_quiz_da_flow"))
    assert.ok(linked.every((d, i) => i === 0 || linked[i - 1]!.relevance >= d.relevance))

    const byTopic = await learning.listDiagramsForQuestion("bank_unknown", { topic: "lbo" })
    assert.deepEqual(
      byTopic.map((d) => d.ref.id),
      ["diag_lbo_sources_uses", "diag_paper_lbo_returns"],
    )
    assert.equal(byTopic[0]?.link_source, "rules")

    const none = await learning.listDiagramsForQuestion("bank_unknown")
    assert.deepEqual(none, [])
  })

  it("exposes multiple diagrams per concept, primary first", async () => {
    const detail = await learning.getConceptDetail("lbo-paper-lbo")
    assert.equal(detail?.item.diagrams[0]?.ref.id, "diag_lbo_sources_uses")
    assert.ok((detail?.item.diagrams.length ?? 0) > 1)
  })

  it("orders diagram versions numerically", () => {
    assert.equal(learning.diagramVersionNumber("v1"), 1)
    assert.equal(learning.diagramVersionNumber("2"), 2)
    assert.equal(learning.diagramVersionNumber("v10"), 10)
    assert.equal(learning.diagramVersionNumber(null), 0)
  })
})
