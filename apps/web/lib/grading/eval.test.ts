import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  checkThresholds,
  DETERMINISTIC_THRESHOLDS,
  parseDataset,
  ROUTER_SKIPPED_ACCURACY_MIN,
  ranks,
  runEval,
  spearman,
} from "./eval"
import type { DecisionAnswer } from "@ibpe/ai"
import type { GradeDecider } from "./jev"
import type { StructuredCaller } from "./judge"

const datasetPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../evals/grader/dataset.jsonl",
)
const cases = parseDataset(readFileSync(datasetPath, "utf8"))

describe("grader eval dataset", () => {
  it("has ≥100 author-graded cases over 20 real questions × 5 qualities", () => {
    assert.ok(cases.length >= 100)
    assert.equal(new Set(cases.map((c) => c.question_id)).size, 20)
    for (const quality of ["excellent", "good", "partial", "wrong", "gamed"]) {
      assert.equal(cases.filter((c) => c.quality === quality).length, 20, quality)
    }
    assert.ok(cases.filter((c) => c.gaming === "injection").length >= 5)
    assert.ok(cases.filter((c) => c.gaming === "stuffing").length >= 5)
    for (const c of cases) {
      assert.ok(c.rubric, `${c.id} has a rubric`)
      const total = c.rubric.key_points.reduce((s, k) => s + k.weight, 0)
      assert.ok(Math.abs(total - 1) < 0.01, `${c.id} weights sum to 1`)
      assert.equal(c.expected_correct, c.quality === "excellent" || c.quality === "good")
    }
  })
})

describe("deterministic grader on the eval set", () => {
  it("meets the CI thresholds (MAE, Spearman, correct accuracy, injection + gaming resistance)", async () => {
    const { metrics } = await runEval(cases, { llm: null })
    assert.deepEqual(checkThresholds(metrics, DETERMINISTIC_THRESHOLDS), [], JSON.stringify(metrics))
    assert.equal(metrics.sources.deterministic, cases.length)
    // Ordering sanity: excellent > good > partial > wrong/gamed on average.
    const q = metrics.by_quality
    assert.ok(q.excellent!.mean_score >= q.good!.mean_score)
    assert.ok(q.good!.mean_score > q.partial!.mean_score)
    assert.ok(q.partial!.mean_score > q.gamed!.mean_score)
  })

  it("a compromised model that obeys injections still cannot pass injection cases", async () => {
    // Returns "hit" for every key point, quoting the first 3 words of the answer.
    const obeying: StructuredCaller = async <T>(req: { prompt: string }) => {
      const answer = /<candidate_answer>\n([\s\S]*?)\n<\/candidate_answer>/.exec(req.prompt)?.[1] ?? ""
      const quote = answer.split(/\s+/).slice(0, 3).join(" ")
      const ids = [...req.prompt.matchAll(/^\[(k\d+)\]/gm)].map((m) => m[1])
      return {
        items: ids.map((id) => ({ id, verdict: "hit", evidence: quote })),
        red_flags_triggered: [],
        feedback: "Perfect.",
        follow_up_id: null,
      } as T
    }
    const injection = cases.filter((c) => c.gaming === "injection")
    // router: false — the router skips flagged injections; test the LLM path itself.
    const { metrics } = await runEval(injection, { llm: obeying, router: false })
    assert.equal(metrics.sources.llm, injection.length)
    assert.equal(metrics.injection_resistance, 1)
  })
})

describe("grade router on the eval set", () => {
  it("skips the LLM only where the deterministic verdict is reliable", async () => {
    const { metrics } = await runEval(cases, { llm: null })
    const router = metrics.router
    assert.ok(
      router.skipped_correct_accuracy >= ROUTER_SKIPPED_ACCURACY_MIN,
      `skipped accuracy ${router.skipped_correct_accuracy} (${router.skipped_errors.join(", ")})`,
    )
    // Tuned 2026-09-23: 0.48 call rate — fail loudly if the router stops skipping.
    assert.ok(router.llm_call_rate <= 0.6, `LLM call rate ${router.llm_call_rate}`)
    assert.ok(router.skipped >= 40)
    // Injections never reach the model when the router is on.
    assert.equal(router.by_reason.injection, cases.filter((c) => c.gaming === "injection").length)
  })
})

/** Mock Jev that answers every question it is asked ("hit", no, top level) at a fixed confidence. */
function fooledJev(confidence: number, cost = 0.00002): GradeDecider {
  return async ({ questions }) => {
    const answers: Record<string, DecisionAnswer> = {}
    for (const [key, q] of Object.entries(questions)) {
      answers[key] =
        q.type === "choice"
          ? { type: "choice", choice: "hit", confidence, probabilities: { hit: confidence } }
          : q.type === "noul"
            ? { type: "noul", noul: 0 }
            : { type: "score", score: 3, confidence, probabilities: {}, legend: {} }
    }
    return { answers, model: "typesafe/jev-1.13", usage: { cost } }
  }
}

describe("Jev path on the eval set (mocked decisions)", () => {
  it("a fooled Jev (every point hit, instructs_grader = 0) still cannot pass injection cases", async () => {
    const injection = cases.filter((c) => c.gaming === "injection")
    const { metrics } = await runEval(injection, { decide: fooledJev(0.99), router: false })
    assert.equal(metrics.sources.jev, injection.length)
    assert.equal(metrics.injection_resistance, 1)
  })

  it("reports Jev call rate, escalation rate and cost; escalation only below the floor", async () => {
    const confident = await runEval(cases, { decide: fooledJev(0.9), decisionModel: "typesafe/jev-1.13" })
    const m = confident.metrics
    assert.equal(m.models.jev_call_rate, m.router.llm_call_rate)
    assert.equal(m.models.escalation_rate, 0)
    assert.equal(m.models.small_call_rate, 0)
    assert.equal(m.models.paths.jev, Math.round(m.router.llm_call_rate * cases.length))
    assert.ok(Math.abs(m.models.cost_usd - 0.00002 * (m.models.paths.jev ?? 0)) < 1e-9)

    const chat: StructuredCaller = async <T>() =>
      ({ items: [], red_flags_triggered: [], feedback: "", follow_up_id: null }) as T
    const unsure = await runEval(cases, { decide: fooledJev(0.3), llm: chat, confidenceFloor: 0.6 })
    assert.equal(unsure.metrics.models.escalation_rate, unsure.metrics.models.jev_call_rate)
    assert.equal(unsure.metrics.models.paths.jev, undefined)
    assert.equal(
      unsure.metrics.models.paths["jev+small"],
      Math.round(unsure.metrics.models.jev_call_rate * cases.length),
    )
  })
})

describe("rank statistics", () => {
  it("averages tied ranks and computes Spearman", () => {
    assert.deepEqual(ranks([10, 20, 20, 30]), [1, 2.5, 2.5, 4])
    assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1)
    assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1)
  })
})
