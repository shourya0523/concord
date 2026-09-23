/**
 * Grader eval harness (plan P3.6 / P3.7).
 *
 *   npm run eval:grader --workspace=@ibpe/web            # deterministic (+ LLM when configured)
 *   GRADER_MODEL=google/gemini-2.5-flash npm run eval:grader --workspace=@ibpe/web
 *   npm run eval:grader --workspace=@ibpe/web -- --verbose --json out.json
 *
 * Always runs the deterministic grader (no key needed) and enforces the CI
 * thresholds below. When credentials for GRADER_MODEL (or the default grade
 * model) are present it also runs the LLM rubric judge and reports its
 * metrics against the plan's C12 targets (MAE ≤ 0.12, correct accuracy ≥ 90%).
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { gradeModelConfig } from "@ibpe/ai"
import {
  checkThresholds,
  DETERMINISTIC_THRESHOLDS,
  LLM_TARGETS,
  parseDataset,
  runEval,
  type EvalMetrics,
  type EvalResult,
} from "../../lib/grading/eval"
import { createGradeCaller } from "../../lib/grading/llm"


const here = dirname(fileURLToPath(import.meta.url))

function printMetrics(label: string, metrics: EvalMetrics) {
  console.log(`\n== ${label} ==`)
  console.log(
    `n=${metrics.n}  MAE=${metrics.mae}  Spearman=${metrics.spearman}  correct-accuracy=${metrics.correct_accuracy}  ` +
      `injection-resistance=${metrics.injection_resistance}  gaming-resistance=${metrics.gaming_resistance}  p95=${metrics.p95_latency_ms}ms`,
  )
  console.log(`sources: ${JSON.stringify(metrics.sources)}`)
  for (const [quality, row] of Object.entries(metrics.by_quality)) {
    console.log(
      `  ${quality.padEnd(9)} n=${row.n}  human=${row.mean_human}  grader=${row.mean_score}  mae=${row.mae}`,
    )
  }
}

function printResults(results: EvalResult[]) {
  for (const r of results) {
    const off = Math.abs(r.score - r.human_score) > 0.25 || r.correct !== r.expected_correct
    console.log(
      `${off ? "!!" : "  "} ${r.id.padEnd(34)} ${r.quality.padEnd(9)} human=${r.human_score.toFixed(2)} ` +
        `grader=${r.score.toFixed(2)} correct=${r.correct}/${r.expected_correct} ${r.score_source}`,
    )
  }
}

async function main() {
  const args = process.argv.slice(2)
  const verbose = args.includes("--verbose")
  const strictLlm = args.includes("--strict-llm")
  const jsonIdx = args.indexOf("--json")
  const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : undefined
  const datasetIdx = args.indexOf("--dataset")
  const datasetPath = datasetIdx >= 0 ? args[datasetIdx + 1]! : join(here, "dataset.jsonl")

  const cases = parseDataset(readFileSync(datasetPath, "utf8"))
  const report: Record<string, unknown> = { dataset: datasetPath, cases: cases.length }

  const deterministic = await runEval(cases, { llm: null })
  printMetrics("deterministic (heuristic rubric grader)", deterministic.metrics)
  if (verbose) printResults(deterministic.results)
  report.deterministic = deterministic.metrics
  const failures = checkThresholds(deterministic.metrics, DETERMINISTIC_THRESHOLDS)

  const config = gradeModelConfig()
  const model = createGradeCaller({ config })
  if (model) {
    const llm = await runEval(cases, { llm: model.caller, model: model.model, timeoutMs: 20_000 })
    printMetrics(`LLM rubric judge (${model.model})`, llm.metrics)
    if (verbose) printResults(llm.results)
    report.llm = { model: model.model, ...llm.metrics }
    const llmFallbacks = cases.length - (llm.metrics.sources.llm ?? 0)
    if (llmFallbacks > 0) console.log(`note: ${llmFallbacks} case(s) fell back to deterministic (timeout/error)`)
    const llmMisses = checkThresholds(llm.metrics, LLM_TARGETS)
    if (llmMisses.length) {
      console.log(`LLM below C12 targets: ${llmMisses.join("; ")}`)
      if (strictLlm) failures.push(...llmMisses.map((m) => `llm: ${m}`))
    }
  } else {
    console.log(
      `\nLLM judge skipped: no credentials for ${config.model} (${config.route}). ` +
        "Set GEMINI_API_KEY (bare model ids) or AI_GATEWAY_API_KEY (provider/model ids) and optionally GRADER_MODEL.",
    )
  }

  if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`)
  if (failures.length) {
    console.error(`\nFAIL: ${failures.join("; ")}`)
    process.exit(1)
  }
  console.log("\nPASS: deterministic grader meets CI thresholds")
}

void main()
