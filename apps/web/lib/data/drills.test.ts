import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { generateDrill, listDrillTemplates } from "@ibpe/domain"
import {
  DrillAttemptResponseSchema,
  DrillNextResponseSchema,
  DrillTemplatesResponseSchema,
} from "@/lib/api/drill-schemas"
import {
  candidateValues,
  checkDrillResponse,
  gradeDrill,
  listDrillTemplateSummaries,
  listStubDrillAttempts,
  nextDrill,
  parseUserNumber,
  pickTemplate,
} from "./drills"

describe("parseUserNumber", () => {
  const cases: Array<[string, number, Partial<{ percent: boolean; multiple: boolean; scale: string | null }>]> = [
    ["7.5%", 7.5, { percent: true }],
    ["7.5 %", 7.5, { percent: true }],
    ["0.075", 0.075, { percent: false }],
    ["$1,250mm", 1250, { scale: "mm" }],
    ["$1.2bn", 1.2, { scale: "bn" }],
    ["1.2 billion", 1.2, { scale: "bn" }],
    ["850k", 850, { scale: "k" }],
    ["2.25x", 2.25, { multiple: true }],
    ["2.25 x", 2.25, { multiple: true }],
    ["-2.5%", -2.5, { percent: true }],
    ["−2.5%", -2.5, { percent: true }],
    ["(40)", -40, {}],
    ["−$40mm", -40, { scale: "mm" }],
    ["$-40", -40, {}],
    ["50bps", 0.5, { percent: true }],
    ["14-15%", 14.5, { percent: true }],
    ["14 to 15%", 14.5, { percent: true }],
    ["about 26% (2x in 3 years)", 26, { percent: true }],
    ["0.6*10% + 0.4*5%*0.75 = 7.5%", 7.5, { percent: true }],
    ["≈ 1,430", 1430, {}],
    ["2.5% dilutive", -2.5, {}],
    ["cash decreases by 6", -6, {}],
    ["accretion/(dilution) of 3.8%", 3.8, {}],
    ["40 use of cash", -40, {}],
    [".5", 0.5, {}],
  ]
  for (const [text, value, extra] of cases) {
    it(`parses ${JSON.stringify(text)}`, () => {
      const parsed = parseUserNumber(text)
      assert.ok(parsed, text)
      assert.ok(Math.abs(parsed.value - value) < 1e-9, `${text}: ${parsed.value}`)
      for (const [k, v] of Object.entries(extra)) {
        assert.equal(parsed[k as keyof typeof parsed], v, `${text}: ${k}`)
      }
    })
  }

  it("returns null without a number", () => {
    assert.equal(parseUserNumber(""), null)
    assert.equal(parseUserNumber("no idea"), null)
  })
})

describe("candidateValues", () => {
  it("scales to $mm and reads decimals as percents", () => {
    assert.deepEqual(candidateValues({ value: 1.2, percent: false, multiple: false, scale: "bn" }, "$mm"), [1200])
    assert.deepEqual(candidateValues({ value: 500, percent: false, multiple: false, scale: "k" }, "$mm"), [0.5])
    assert.deepEqual(candidateValues({ value: 0.075, percent: false, multiple: false, scale: null }, "%"), [0.075, 7.5])
    assert.deepEqual(candidateValues({ value: 7.5, percent: true, multiple: false, scale: null }, "%"), [7.5])
  })
})

describe("checkDrillResponse", () => {
  const pct = { answer: 7.5, unit: "%", tolerance: 0.1, tolerance_kind: "absolute" as const }
  const mm = { answer: 1430, unit: "$mm", tolerance: 0.01, tolerance_kind: "relative" as const }

  it("accepts in-tolerance answers in any notation", () => {
    for (const text of ["7.5%", "7.5", "0.075", "7.45 %", "WACC = 7.55%"]) {
      assert.equal(checkDrillResponse(pct, text).correct, true, text)
    }
    for (const text of ["1430", "$1,430mm", "1.43bn", "$1.425 billion"]) {
      const r = checkDrillResponse(mm, text)
      assert.equal(r.correct, true, text)
      assert.equal(r.score, 1)
    }
  })

  it("gives half credit for near misses and zero otherwise", () => {
    assert.deepEqual(checkDrillResponse(pct, "7.75%"), { found: 7.75, correct: false, score: 0.5 })
    assert.equal(checkDrillResponse(pct, "9%").score, 0)
    assert.deepEqual(checkDrillResponse(pct, "no idea"), { found: null, correct: false, score: 0 })
  })

  it("respects sign", () => {
    const neg = { answer: -40, unit: "$mm", tolerance: 0.5, tolerance_kind: "absolute" as const }
    assert.equal(checkDrillResponse(neg, "40").correct, false)
    assert.equal(checkDrillResponse(neg, "(40)").correct, true)
    assert.equal(checkDrillResponse(neg, "-40").correct, true)
  })

  it("grades every template's own answer as correct", () => {
    for (const t of listDrillTemplates()) {
      const d = generateDrill(t.id, "grade1")
      assert.ok(d)
      const typed = `${Math.round(d.solution.answer * 1000) / 1000}${d.solution.unit === "%" ? "%" : ""}`
      assert.equal(checkDrillResponse(d.solution, typed).correct, true, `${t.id}: ${typed}`)
    }
  })
})

describe("pickTemplate", () => {
  const templates = listDrillTemplates()

  it("prefers weak concepts", () => {
    const weak = new Set(["concept_accounting_foundations"])
    let hits = 0
    let seed = 1
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let k = 0; k < 2000; k += 1) {
      if (pickTemplate(templates, { weakConcepts: weak, rand })?.concept_id === "concept_accounting_foundations") hits += 1
    }
    const share = templates.filter((t) => t.concept_id === "concept_accounting_foundations").length / templates.length
    assert.ok(hits / 2000 > share * 1.8, `weak share ${hits / 2000} vs base ${share}`)
  })

  it("returns null for no candidates and the only candidate otherwise", () => {
    assert.equal(pickTemplate([]), null)
    assert.equal(pickTemplate([templates[0]!], { lastTemplateId: templates[0]!.id })?.id, templates[0]!.id)
  })
})

describe("nextDrill + gradeDrill (in-memory, no DATABASE_URL)", () => {
  it("serves a drill for a template and filters", async () => {
    const byTemplate = await nextDrill({ userId: "u_test", templateId: "wacc_weights", seed: "abc" })
    assert.equal(DrillNextResponseSchema.safeParse(byTemplate).success, true)
    assert.equal(byTemplate.drill?.id, "drill:wacc_weights:abc")

    const byConcept = await nextDrill({ userId: "u_test", conceptId: "concept_lbo_paper_lbo", difficulty: "easy" })
    assert.equal(byConcept.drill?.concept_id, "concept_lbo_paper_lbo")
    assert.equal(byConcept.drill?.difficulty, "easy")

    assert.equal((await nextDrill({ userId: "u_test", templateId: "nope" })).drill, null)
    assert.equal((await nextDrill({ userId: "u_test", conceptId: "concept_none" })).drill, null)
  })

  it("grades by re-generating from the id and records the attempt", async () => {
    const drill = generateDrill("moic_basic", "abc123")
    assert.ok(drill)
    const right = await gradeDrill({ userId: "u_grade", drillId: drill.instance.id, responseText: "2.25x" })
    assert.equal(DrillAttemptResponseSchema.safeParse(right).success, true)
    assert.equal(right.correct, true)
    assert.equal(right.score, 1)
    assert.equal(right.source, "stub")
    assert.match(right.solution.explanation, /MOIC/)

    const wrong = await gradeDrill({ userId: "u_grade", drillId: drill.instance.id, responseText: "3x", timeSpentMs: 1200 })
    assert.equal(wrong.correct, false)
    assert.equal(wrong.found, 3)

    const rows = listStubDrillAttempts("u_grade")
    assert.equal(rows.length, 2)
    assert.equal(rows[0]?.time_spent_ms, 1200)
    assert.equal(rows[0]?.expected_value, 2.25)

    const summary = await listDrillTemplateSummaries("u_grade")
    assert.equal(DrillTemplatesResponseSchema.safeParse(summary).success, true)
    const moic = summary.items.find((i) => i.id === "moic_basic")
    assert.equal(moic?.attempts, 2)
    assert.equal(moic?.correct, 1)
  })

  it("rejects unknown drill ids with a 404-style error", async () => {
    await assert.rejects(
      gradeDrill({ userId: "u_grade", drillId: "drill:nope:abc", responseText: "1" }),
      (err: Error & { status?: number }) => err.status === 404,
    )
  })
})
