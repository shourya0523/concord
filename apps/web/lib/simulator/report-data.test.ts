import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { PracticeSession } from "@ibpe/contracts"

import { MockReportRequestSchema, MockReportSchema } from "@/lib/api/grading-ui-schemas"

import {
  attemptFromRow,
  attemptsFromRequest,
  buildSessionReport,
  heatFromSession,
  reportStages,
} from "./report-data"

const session: PracticeSession = {
  id: "sess_1",
  user_id: "u1",
  mode: "simulator",
  firm_ids: ["firm_gs"],
  concept_ids: [],
  question_ids: ["q_acc", "q_dcf"],
  started_at: "2026-09-23T10:00:00Z",
  metadata: {
    stub: true,
    firm_context_snapshot: {
      firm_ids: ["firm_gs"],
      heat_topics: [{ firm_id: "firm_gs", topic_id: "valuation", intensity: 0.8, sample_size: 12 }],
      notes: [],
    },
    simulator: {
      stage_template: {
        ib: [
          { id: "ib_accounting", label: "Accounting technicals", minutes: 12 },
          { id: "ib_valuation", label: "Valuation and DCF", minutes: 15 },
        ],
      },
      stage_topic_map: { ib_accounting: ["accounting"], ib_valuation: ["valuation"] },
    },
  },
}

describe("report-data", () => {
  it("maps DB rows with grade_json", () => {
    const attempt = attemptFromRow({
      question_id: "q1",
      score: "0.55",
      score_source: "llm",
      grade_json: {
        feedback: "ok",
        weak_topics: ["valuation", 3],
        citations: [{ id: "ans_1", kind: "teaching_answer" }, { bad: true }],
      },
      created_at: new Date("2026-09-23T10:00:00Z"),
      topic: "valuation",
    })
    assert.equal(attempt.score, 0.55)
    assert.deepEqual(attempt.weak_topics, ["valuation"])
    assert.equal(attempt.citations?.length, 1)
    assert.equal(attempt.created_at, "2026-09-23T10:00:00.000Z")
  })

  it("derives stages from session metadata when the request has none", () => {
    const stages = reportStages(MockReportRequestSchema.parse({}), session)
    assert.deepEqual(stages.map((s) => [s.id, s.label]), [
      ["ib_accounting", "Accounting technicals"],
      ["ib_valuation", "Valuation and DCF"],
    ])
    assert.equal(heatFromSession(session).length, 1)
  })

  it("builds a report from request grades without a database", async () => {
    const body = MockReportRequestSchema.parse({
      firm_name: "Goldman",
      stages: [
        {
          stage_id: "ib_accounting",
          question_id: "q_acc",
          topic: "accounting",
          grades: [{ score_source: "llm", score: 0.9, citations: [{ id: "ans_acc", kind: "teaching_answer" }] }],
        },
        {
          stage_id: "ib_valuation",
          question_id: "q_dcf",
          topic: "valuation",
          grades: [
            { score_source: "deterministic", score: 0.3 },
            { score_source: "deterministic", score: 0.6 },
          ],
        },
      ],
    })
    assert.equal(attemptsFromRequest(body).length, 3)
    const report = await buildSessionReport({
      sessionId: "sess_1",
      userId: "u1",
      session,
      body,
      deps: { env: {} as NodeJS.ProcessEnv },
    })
    MockReportSchema.parse(report)
    assert.equal(report.attempts_source, "request")
    assert.equal(report.summary_source, "deterministic")
    assert.equal(report.summary_verified, false)
    assert.equal(report.stages[1]!.score, 0.3)
    assert.equal(report.stages[1]!.follow_up_score, 0.6)
    assert.equal(report.stages[1]!.label, "Valuation and DCF")
    assert.match(report.summary, /\[heat:firm_gs:valuation\]/)
  })

  it("prefers database attempts and swaps in a validated AI coaching paragraph", async () => {
    const report = await buildSessionReport({
      sessionId: "sess_1",
      userId: "u1",
      session,
      body: MockReportRequestSchema.parse({}),
      deps: {
        env: { OPENROUTER_API_KEY: "k" } as unknown as NodeJS.ProcessEnv,
        generate: async () => "Valuation is your priority fix [heat:firm_gs:valuation] [ans_dcf].",
        verify: async () => ({ accepted: true, verdict: "supported", confidence: 0.9 }),
        dbAttempts: [
          {
            question_id: "q_dcf",
            score: 0.4,
            score_source: "llm",
            topic: "valuation",
            citations: [{ id: "ans_dcf", kind: "teaching_answer" }],
          },
        ],
      },
    })
    assert.equal(report.attempts_source, "database")
    assert.equal(report.summary_source, "llm")
    assert.equal(report.summary_verified, true)
    assert.match(report.deterministic_summary, /Overall 40%/)
    assert.ok(report.citations.some((c) => c.id === "ans_dcf"))
  })
})
