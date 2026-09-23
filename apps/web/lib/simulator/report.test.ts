import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildCoachPrompt, generateCoaching, validateCoaching } from "./coach"
import { allowedCitations, buildMockReport, type ReportAttempt } from "./report"

const STAGES = [
  { id: "ib_fit", label: "Fit / motivation" },
  { id: "ib_accounting", label: "Accounting technicals", question_id: "q_acc" },
  { id: "ib_valuation", label: "Valuation & DCF", question_id: "q_dcf" },
  { id: "ib_deal_judgement", label: "Market / deal judgement", question_id: "q_ma" },
]

const HEAT = [
  { firm_id: "firm_gs", topic_id: "valuation", intensity: 0.9, sample_size: 40 },
  { firm_id: "firm_gs", topic_id: "accounting", intensity: 0.5, sample_size: 20 },
]

function attempt(
  question_id: string,
  score: number,
  extra: Partial<ReportAttempt> = {},
): ReportAttempt {
  return {
    question_id,
    score,
    score_source: "llm",
    citations: [{ id: `ans_${question_id}`, kind: "teaching_answer", label: "Teaching answer" }],
    weak_topics: [],
    created_at: "2026-09-23T10:00:00Z",
    ...extra,
  }
}

describe("buildMockReport", () => {
  const attempts = [
    attempt("q_fit", 0.8, { topic: "behavioral" }),
    attempt("q_acc", 0.9, { topic: "accounting" }),
    attempt("q_dcf", 0.4, { topic: "valuation", feedback: "Missed the terminal value." }),
    attempt("q_dcf", 0.75, { topic: "valuation", created_at: "2026-09-23T10:05:00Z" }),
    attempt("q_ma", 0.6, { topic: "merger_models", weak_topics: ["capital_structure"] }),
  ]
  const report = buildMockReport({ stages: STAGES, attempts, heatTopics: HEAT, firmName: "Goldman" })

  it("aggregates per-stage scores (first attempt counts; follow-up tracked)", () => {
    assert.deepEqual(
      report.stages.map((s) => [s.stage_id, s.question_id, s.score]),
      [
        ["ib_fit", "q_fit", 0.8],
        ["ib_accounting", "q_acc", 0.9],
        ["ib_valuation", "q_dcf", 0.4],
        ["ib_deal_judgement", "q_ma", 0.6],
      ],
    )
    assert.equal(report.stages[2]!.follow_up_score, 0.75)
    assert.equal(report.stages[2]!.feedback, "Missed the terminal value.")
    assert.equal(report.overall_score, 0.68)
    assert.equal(report.graded_stages, 4)
  })

  it("maps unassigned attempts to stages by topic", () => {
    assert.equal(report.stages[0]!.question_id, "q_fit")
  })

  it("ranks strongest and weakest topics", () => {
    assert.deepEqual(report.strongest_topics.map((t) => t.topic), ["accounting", "behavioral"])
    assert.equal(report.weakest_topics[0]!.topic, "valuation")
    assert.ok(report.weakest_topics.some((t) => t.topic === "capital_structure"))
  })

  it("recommends concepts for weak stages, hottest firm topic first, with heat citations", () => {
    assert.equal(report.recommended_concepts[0]!.slug, "dcf-wacc")
    assert.deepEqual(report.recommended_concepts[0]!.citation_ids, ["heat:firm_gs:valuation"])
    assert.ok(report.recommended_concepts.some((c) => c.slug === "ev-equity-value"))
  })

  it("writes a deterministic summary citing teaching + heat ids", () => {
    assert.equal(report.summary_source, "deterministic")
    assert.match(report.summary, /Overall 68%/)
    assert.match(report.summary, /\[ans_q_dcf\]/)
    assert.match(report.summary, /\[heat:firm_gs:valuation\]/)
    const kinds = new Set(report.citations.map((c) => c.kind))
    assert.ok(kinds.has("teaching_answer") && kinds.has("heat_topic"))
  })

  it("counts reveal copies as zero and handles an empty mock", () => {
    const copied = buildMockReport({
      stages: STAGES.slice(1, 2),
      attempts: [attempt("q_acc", 0.95, { score_source: "reveal_copy" })],
    })
    assert.equal(copied.stages[0]!.score, 0)
    const empty = buildMockReport({ stages: STAGES, attempts: [] })
    assert.equal(empty.overall_score, null)
    assert.equal(empty.graded_stages, 0)
    assert.match(empty.summary, /No stages were graded/)
  })
})

describe("coaching", () => {
  const attempts = [attempt("q_acc", 0.9, { topic: "accounting" }), attempt("q_dcf", 0.3, { topic: "valuation" })]
  const report = buildMockReport({ stages: STAGES, attempts, heatTopics: HEAT })
  const allowed = allowedCitations({ attempts, heatTopics: HEAT })
  const ids = new Set(allowed.map((c) => c.id))

  it("accepts fully cited text and rejects uncited, unknown or quoted text", () => {
    assert.ok(validateCoaching("Accounting was crisp [ans_q_acc]. Fix the DCF bridge first [ans_q_dcf] [heat:firm_gs:valuation].", ids))
    assert.equal(validateCoaching("Accounting was crisp. Fix DCF [ans_q_dcf].", ids), null)
    assert.equal(validateCoaching("Fix DCF [glassdoor_123].", ids), null)
    assert.equal(validateCoaching("They asked “walk me through a DCF” [ans_q_dcf].", ids), null)
  })

  it("returns null without a key and never calls the model", async () => {
    let called = false
    const result = await generateCoaching(
      { report, allowed },
      { env: {} as NodeJS.ProcessEnv, generate: async () => ((called = true), "x") },
    )
    assert.equal(result, null)
    assert.equal(called, false)
  })

  it("uses the injected model and validates its output", async () => {
    let prompt = ""
    const good = await generateCoaching(
      { report, allowed, firmName: "Goldman" },
      {
        env: { GEMINI_API_KEY: "k" } as unknown as NodeJS.ProcessEnv,
        generate: async (input) => {
          prompt = input.prompt
          return "Strong accounting [ans_q_acc]. Valuation is the priority fix [ans_q_dcf] [heat:firm_gs:valuation]."
        },
      },
    )
    assert.deepEqual(good?.citation_ids.sort(), ["ans_q_acc", "ans_q_dcf", "heat:firm_gs:valuation"])
    assert.match(prompt, /ALLOWED_CITATIONS/)
    assert.doesNotMatch(prompt, /glassdoor/i)

    const bad = await generateCoaching(
      { report, allowed },
      { env: { GEMINI_API_KEY: "k" } as unknown as NodeJS.ProcessEnv, generate: async () => "Uncited advice." },
    )
    assert.equal(bad, null)
  })

  it("prompt lists stages and allowed ids", () => {
    const prompt = buildCoachPrompt(report, allowed)
    assert.match(prompt, /Valuation & DCF/)
    assert.match(prompt, /heat:firm_gs:valuation/)
  })
})
