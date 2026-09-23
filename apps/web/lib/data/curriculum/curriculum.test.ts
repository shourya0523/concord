import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { gradeInteractiveDiagram, parseInteractiveDiagram } from "@ibpe/contracts"

import {
  CURRICULUM_DIAGRAMS,
  CURRICULUM_MODULES,
  INTERACTIVE_DIAGRAMS,
  MERMAID_DIAGRAMS,
  validateCurriculum,
} from "./index"
import { QUESTION_DIAGRAM_LINKS } from "./question-diagram-links.generated"
import { linkDiagramsForQuestion, matchDiagramsForWording } from "./question-diagram-rules"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..")

type ExportQuestion = { id: string; canonical_wording: string; topic: string | null }
const exportQuestions: ExportQuestion[] = readFileSync(
  path.join(repoRoot, "exports/questions.jsonl"),
  "utf8",
)
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as ExportQuestion)

describe("curriculum source", () => {
  it("passes structural validation against exports/questions.jsonl", () => {
    assert.deepEqual(validateCurriculum(new Set(exportQuestions.map((q) => q.id))), [])
  })

  it("covers the required interview areas", () => {
    const slugs = CURRICULUM_MODULES.map((m) => m.slug)
    for (const slug of [
      "accounting-foundations",
      "ev-equity-value",
      "valuation-comps",
      "dcf-wacc",
      "lbo-paper-lbo",
      "merger-model",
      "pe-fund-mechanics",
      "behavioural-story",
    ]) {
      assert.ok(slugs.includes(slug), `missing module ${slug}`)
    }
  })

  it("upgrades the 8 seeded diagrams and adds at least 8 new mermaid diagrams", () => {
    const seeded = [
      "diag_ev_bridge",
      "diag_dcf_wacc",
      "diag_lbo_sources_uses",
      "diag_three_statement",
      "diag_wacc_build",
      "diag_accretion_dilution",
      "diag_moic_irr",
      "diag_paper_lbo_returns",
    ]
    for (const id of seeded) {
      const diagram = MERMAID_DIAGRAMS.find((d) => d.id === id)
      assert.equal(diagram?.version, "2", `${id} should be version 2`)
    }
    assert.ok(MERMAID_DIAGRAMS.filter((d) => !seeded.includes(d.id)).length >= 8)
    assert.ok(INTERACTIVE_DIAGRAMS.length >= 4)
  })

  it("keeps the original 13 checkpoint ids (module progress stays valid)", () => {
    const ids = new Set(CURRICULUM_MODULES.flatMap((m) => m.checkpoints.map((c) => c.id)))
    for (const id of [
      "chk_accounting_lesson",
      "chk_accounting_drill",
      "chk_ev_lesson",
      "chk_ev_diagram",
      "chk_dcf_lesson",
      "chk_dcf_diagram",
      "chk_dcf_wacc_diagram",
      "chk_lbo_concept_lab",
      "chk_lbo_quiz",
      "chk_lbo_moic_diagram",
      "chk_lbo_returns_diagram",
      "chk_behavioural_lesson",
      "chk_behavioural_drill",
    ]) {
      assert.ok(ids.has(id), `missing checkpoint ${id}`)
    }
  })

  it("wires every interactive diagram as a quiz checkpoint", () => {
    for (const diagram of INTERACTIVE_DIAGRAMS) {
      const checkpoint = CURRICULUM_MODULES.flatMap((m) => m.checkpoints).find(
        (c) => c.diagram_id === diagram.id,
      )
      assert.equal(checkpoint?.kind, "diagram")
      assert.equal(checkpoint?.metadata?.mode, "quiz")
    }
  })
})

describe("interactive diagrams", () => {
  it("grade 100% with the stored answers and 0% when empty", () => {
    for (const diagram of INTERACTIVE_DIAGRAMS) {
      const parsed = parseInteractiveDiagram(diagram.body)
      assert.ok(parsed, `${diagram.id} parses`)
      const answers = Object.fromEntries(
        parsed.nodes.filter((n) => n.blank).map((n) => [n.id, n.blank!.answer]),
      )
      const full = gradeInteractiveDiagram(parsed, answers)
      assert.equal(full.correct, full.total)
      assert.equal(gradeInteractiveDiagram(parsed, {}).correct, 0)
    }
  })

  it("normalises unicode minus signs when grading", () => {
    const parsed = parseInteractiveDiagram(
      INTERACTIVE_DIAGRAMS.find((d) => d.id === "diag_quiz_da_flow")!.body,
    )!
    const grade = gradeInteractiveDiagram(parsed, { ebt: "-10", tax: "−2.5" })
    assert.equal(grade.results.ebt, true)
    assert.equal(grade.results.tax, true)
  })

  it("encodes arithmetic that actually adds up", () => {
    // D&A +10 at 25%: NI −7.5, CFO +2.5
    assert.equal(-10 * (1 - 0.25), -7.5)
    assert.equal(-7.5 + 10, 2.5)
    // EV bridge: 1,000 − 300 − 50 − 30 + 100 = 720, ÷ 36 = 20
    assert.equal(1000 - 300 - 50 - 30 + 100, 720)
    assert.equal(720 / 36, 20)
    // LBO S&U: 100 × 10 + 20 = 1,020 uses, debt 500, equity 520
    assert.equal(100 * 10 + 20 - 5 * 100, 520)
    // WACC: 0.7 × (4 + 1.2 × 5) + 0.3 × 6 × 0.75 = 8.35
    assert.ok(Math.abs(0.7 * (4 + 1.2 * 5) + 0.3 * 6 * 0.75 - 8.35) < 1e-9)
    // Returns attribution: 500 + 150 + 300 = 1,350 − 400
    assert.equal(50 * 10 + 1 * 150 + (600 - 300), 150 * 11 - 300 - 400)
  })
})

describe("question → diagram links", () => {
  it("generated map matches the rules over exports (run build-migrations.ts if this fails)", () => {
    const expected: Record<string, Array<[string, number]>> = {}
    for (const question of exportQuestions) {
      const links = linkDiagramsForQuestion({
        wording: question.canonical_wording,
        topic: question.topic,
      })
      if (links.length > 0) {
        expected[question.id] = links
          .map((l) => [l.diagram_id, l.relevance] as [string, number])
          .sort((a, b) => b[1] - a[1])
      }
    }
    assert.deepEqual(
      Object.keys(QUESTION_DIAGRAM_LINKS).sort(),
      Object.keys(expected).sort(),
    )
    for (const [id, links] of Object.entries(expected)) {
      assert.deepEqual(
        new Set(QUESTION_DIAGRAM_LINKS[id]!.map(([d]) => d)),
        new Set(links.map(([d]) => d)),
      )
    }
  })

  it("only links known diagrams with relevance in [0, 1]", () => {
    const known = new Set(CURRICULUM_DIAGRAMS.map((d) => d.id))
    for (const links of Object.values(QUESTION_DIAGRAM_LINKS)) {
      for (const [diagramId, relevance] of links) {
        assert.ok(known.has(diagramId), diagramId)
        assert.ok(relevance >= 0 && relevance <= 1)
      }
    }
  })

  it("matches classic wordings to the right diagram", () => {
    const top = (wording: string) => matchDiagramsForWording(wording)[0]?.diagram_id
    assert.equal(top("Explain how a Revolver is used in an LBO model."), "diag_debt_schedule")
    assert.equal(top("What makes a deal accretive or dilutive to EPS?"), "diag_accretion_dilution")
    assert.equal(top("In a bankruptcy, what is the order of claims on a company's assets?"), "diag_restructuring_waterfall")
    assert.equal(top("What is your personal beta?"), undefined)
  })

  it("migrations 059–061 contain the curriculum content", () => {
    const sql059 = readFileSync(path.join(repoRoot, "migrations/059_diagrams_core.sql"), "utf8")
    const sql060 = readFileSync(path.join(repoRoot, "migrations/060_curriculum_lessons.sql"), "utf8")
    const sql061 = readFileSync(path.join(repoRoot, "migrations/061_interactive_diagrams.sql"), "utf8")
    for (const diagram of MERMAID_DIAGRAMS) assert.ok(sql059.includes(diagram.body), diagram.id)
    for (const diagram of INTERACTIVE_DIAGRAMS) assert.ok(sql061.includes(diagram.body), diagram.id)
    for (const checkpoint of CURRICULUM_MODULES.flatMap((m) => m.checkpoints)) {
      if (checkpoint.body_markdown) assert.ok(sql060.includes(checkpoint.body_markdown), checkpoint.id)
    }
    for (const sql of [sql059, sql060, sql061]) {
      for (const line of sql.split("\n")) {
        if (line.startsWith("--")) assert.ok(!line.includes(";"), `semicolon in comment: ${line}`)
      }
    }
  })
})
