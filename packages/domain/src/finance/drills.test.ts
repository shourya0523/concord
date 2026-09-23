import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DRILL_TEMPLATES,
  allowedError,
  createRng,
  drillId,
  fmtNum,
  generateDrill,
  hashSeed,
  listDrillTemplates,
  parseDrillId,
  withinTolerance,
} from "./index.js"

const REQUIRED_FAMILIES = [
  /^wacc/,
  /^moic/,
  /^irr/,
  /^ev_to/,
  /lbo/,
  /^accretion/,
  /^ufcf/,
  /^three_statement/,
  /^nwc/,
  /^comps/,
]

test("at least 10 templates covering every required family", () => {
  const ids = listDrillTemplates().map((t) => t.id)
  assert.ok(ids.length >= 10, `only ${ids.length} templates`)
  assert.equal(new Set(ids).size, ids.length, "template ids must be unique")
  for (const re of REQUIRED_FAMILIES) {
    assert.ok(ids.some((id) => re.test(id)), `no template for ${re}`)
  }
  for (const t of listDrillTemplates()) {
    assert.match(t.id, /^[a-z0-9_]+$/)
    assert.ok(["easy", "medium", "hard"].includes(t.difficulty))
    assert.ok(t.title && t.topic)
  }
})

test("same (template, seed) ⇒ identical output; ids round-trip", () => {
  for (const t of listDrillTemplates()) {
    const a = generateDrill(t.id, "seed42")
    const b = generateDrill(t.id, "seed42")
    assert.ok(a && b)
    assert.deepEqual(a, b)
    assert.equal(a.instance.id, drillId(t.id, "seed42"))
    assert.deepEqual(parseDrillId(a.instance.id), { templateId: t.id, seed: "seed42" })
  }
})

test("different seeds give different numbers", () => {
  for (const t of listDrillTemplates()) {
    const prompts = new Set<string>()
    for (let k = 0; k < 20; k += 1) prompts.add(generateDrill(t.id, `s${k}`)?.instance.prompt ?? "")
    assert.ok(prompts.size >= 5, `${t.id} produced only ${prompts.size} distinct prompts`)
  }
})

test("every template produces sane drills across many seeds", () => {
  for (const template of DRILL_TEMPLATES) {
    for (let k = 0; k < 300; k += 1) {
      const d = generateDrill(template.meta.id, `k${k}`)
      assert.ok(d, `${template.meta.id} k${k}`)
      const { instance, solution } = d
      assert.ok(Number.isFinite(solution.answer), `${instance.id} non-finite answer`)
      assert.ok(solution.tolerance > 0)
      assert.ok(withinTolerance(solution, solution.answer))
      assert.ok(!withinTolerance(solution, solution.answer + allowedError(solution) * 1.5 + 1e-6))
      for (const text of [instance.prompt, solution.explanation]) {
        assert.ok(!/NaN|undefined|Infinity|null/.test(text), `${instance.id}: bad text ${text}`)
      }
      assert.ok(solution.explanation.split("\n").length >= 2, `${instance.id} explanation too short`)
      assert.equal(instance.unit, solution.unit)
      if (solution.unit === "$mm" && template.meta.id !== "nwc_change") {
        assert.ok(solution.answer > 0, `${instance.id} expected positive $mm answer`)
      }
      if (template.meta.id === "paper_lbo_moic" || template.meta.id === "moic_basic") {
        assert.ok(solution.answer > 0.5 && solution.answer < 6, `${instance.id} MOIC ${solution.answer}`)
      }
      if (template.meta.id.startsWith("wacc")) {
        assert.ok(solution.answer > 3 && solution.answer < 16, `${instance.id} WACC ${solution.answer}`)
      }
      if (template.meta.id === "nwc_change") assert.notEqual(solution.answer, 0)
    }
  }
})

test("unknown template or malformed seed returns null", () => {
  assert.equal(generateDrill("nope", "abc"), null)
  assert.equal(generateDrill("wacc_weights", "bad seed!"), null)
  assert.equal(generateDrill("wacc_weights", ""), null)
  assert.equal(parseDrillId("drill:WACC:abc"), null)
  assert.equal(parseDrillId("q_123"), null)
})

test("golden values pin the RNG and templates across runtimes", () => {
  assert.equal(hashSeed(""), 0x811c9dc5)
  assert.equal(hashSeed("abc123"), 951228933)
  const rng = createRng("abc123")
  assert.deepEqual(
    [rng.next(), rng.next(), rng.next()],
    [0.9386920682154596, 0.0011201018933206797, 0.22028766153380275],
  )
  const moic = generateDrill("moic_basic", "abc123")
  assert.ok(moic)
  assert.equal(moic.instance.prompt, GOLDEN_MOIC_PROMPT)
  assert.equal(moic.solution.answer, 2.25)
  const da = generateDrill("three_statement_da", "abc123")
  assert.ok(da)
  assert.equal(da.solution.answer, 40)
})

test("D&A template answer matches the classic +10 / 40% walk", () => {
  // Find a seed that asks the classic question and check the numbers.
  for (let k = 0; k < 500; k += 1) {
    const d = generateDrill("three_statement_da", `c${k}`)
    const i = d?.instance.inputs as { da_change: number; tax_rate: number; asked: string }
    if (i.da_change === 10 && i.tax_rate === 0.4 && i.asked === "cash_change") {
      assert.ok(d)
      assert.ok(Math.abs(d.solution.answer - 4) < 1e-9)
      assert.match(d.solution.explanation, /net income −\$6/)
      return
    }
  }
  assert.fail("no classic D&A seed found")
})

test("fmtNum is deterministic and locale-free", () => {
  assert.equal(fmtNum(1234567.891, 1), "1,234,567.9")
  assert.equal(fmtNum(0.1 + 0.2, 2), "0.3")
  assert.equal(fmtNum(-12.5, 1), "−12.5")
  assert.equal(fmtNum(-0.001, 1), "0")
})

const GOLDEN_MOIC_PROMPT =
  "A sponsor invests $520mm of equity and receives $1,170mm at exit after 3 years. What is the MOIC (x)?"
