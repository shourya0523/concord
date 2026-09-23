import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  checkThresholds,
  DETERMINISTIC_THRESHOLDS,
  parseDataset,
  ranks,
  runEval,
  spearman,
} from "./eval"
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
    const { metrics } = await runEval(injection, { llm: obeying })
    assert.equal(metrics.sources.llm, injection.length)
    assert.equal(metrics.injection_resistance, 1)
  })
})

describe("rank statistics", () => {
  it("averages tied ranks and computes Spearman", () => {
    assert.deepEqual(ranks([10, 20, 20, 30]), [1, 2.5, 2.5, 4])
    assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1)
    assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1)
  })
})
