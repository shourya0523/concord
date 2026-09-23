/**
 * Grader eval harness (plan P3.6 / P3.7).
 *
 *   npm run eval:grader --workspace=@ibpe/web            # deterministic (+ LLM when configured)
 *   LLM_PRIMARY_MODEL=<jev-slug> OPENROUTER_API_KEY=… npm run eval:grader --workspace=@ibpe/web
 *   GRADER_MODEL=z-ai/glm-4.7-flash npm run eval:grader --workspace=@ibpe/web   # bake-off override
 *   npm run eval:grader --workspace=@ibpe/web -- --verbose --json out.json
 *   npm run eval:grader --workspace=@ibpe/web -- --no-router   # every case to the LLM
 *
 * Always runs the deterministic grader (no key needed), enforces the CI
 * thresholds and reports the grade router: LLM call rate and deterministic
 * accuracy on the cases it skips (target ≥ 0.95). With OPENROUTER_API_KEY it
 * also runs the production path (router + PRIMARY tier, SMALL fallback) and
 * reports it against the plan's C12 targets (MAE ≤ 0.12, correct accuracy ≥ 90%).
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
  ROUTER_SKIPPED_ACCURACY_MIN,
  runEval,
  type EvalMetrics,
  type EvalResult,
} from "../../lib/grading/eval"
import { createGradeCaller, type GradeUsage } from "../../lib/grading/llm"


const here = dirname(fileURLToPath(import.meta.url))

function printMetrics(label: string, metrics: EvalMetrics) {
  console.log(`\n== ${label} ==`)
  console.log(
    `n=${metrics.n}  MAE=${metrics.mae}  Spearman=${metrics.spearman}  correct-accuracy=${metrics.correct_accuracy}  ` +
      `injection-resistance=${metrics.injection_resistance}  gaming-resistance=${metrics.gaming_resistance}  p95=${metrics.p95_latency_ms}ms`,
  )
  console.log(`sources: ${JSON.stringify(metrics.sources)}`)
  console.log(
    `router: LLM call rate=${metrics.router.llm_call_rate}  skipped=${metrics.router.skipped}  ` +
      `skipped correct-accuracy=${metrics.router.skipped_correct_accuracy}  reasons=${JSON.stringify(metrics.router.by_reason)}`,
  )
  if (metrics.router.skipped_errors.length) {
    console.log(`  skipped cases graded wrong: ${metrics.router.skipped_errors.join(", ")}`)
  }
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
        `grader=${r.score.toFixed(2)} correct=${r.correct}/${r.expected_correct} ${r.score_source} router=${r.router_reason}`,
    )
  }
}

async function main() {
  const args = process.argv.slice(2)
  const verbose = args.includes("--verbose")
  const strictLlm = args.includes("--strict-llm")
  const useRouter = !args.includes("--no-router")
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
  if (deterministic.metrics.router.skipped_correct_accuracy < ROUTER_SKIPPED_ACCURACY_MIN) {
    failures.push(
      `router skipped correct-accuracy ${deterministic.metrics.router.skipped_correct_accuracy} < ${ROUTER_SKIPPED_ACCURACY_MIN}`,
    )
  }

  const config = gradeModelConfig()
  console.log(
    `\nmodels: primary=${config.model}  fallback(small)=${config.fallbackModel ?? "(none)"}  route=${config.route}`,
  )
  const usages: GradeUsage[] = []
  const model = createGradeCaller({ config, onUsage: (u) => usages.push(u) })
  if (model) {
    const llm = await runEval(cases, {
      llm: model.caller,
      model: model.model,
      timeoutMs: 20_000,
      router: useRouter,
    })
    printMetrics(`LLM rubric judge (${model.model}${useRouter ? ", router on" : ", router off"})`, llm.metrics)
    if (verbose) printResults(llm.results)
    const served: Record<string, number> = {}
    for (const u of usages) served[u.model] = (served[u.model] ?? 0) + 1
    const cost = usages.reduce((sum, u) => sum + (u.cost ?? 0), 0)
    const calls = usages.length
    console.log(
      `LLM calls=${calls}/${cases.length} (rate ${(calls / cases.length).toFixed(3)})  served-by=${JSON.stringify(served)}  ` +
        `cost=$${cost.toFixed(5)}  tokens in/out=${usages.reduce((s, u) => s + (u.input_tokens ?? 0), 0)}/${usages.reduce((s, u) => s + (u.output_tokens ?? 0), 0)}`,
    )
    report.llm = {
      model: model.model,
      fallback_model: config.fallbackModel ?? null,
      router_enabled: useRouter,
      llm_calls: calls,
      served_by: served,
      cost_usd: cost,
      ...llm.metrics,
    }
    const routed = llm.results.filter((r) => r.router_llm).length
    const llmFallbacks = routed - (llm.metrics.sources.llm ?? 0)
    if (llmFallbacks > 0) console.log(`note: ${llmFallbacks} routed case(s) fell back to deterministic (timeout/error)`)
    const llmMisses = checkThresholds(llm.metrics, LLM_TARGETS)
    if (llmMisses.length) {
      console.log(`LLM below C12 targets: ${llmMisses.join("; ")}`)
      if (strictLlm) failures.push(...llmMisses.map((m) => `llm: ${m}`))
    }
  } else {
    console.log(
      `\nLLM judge skipped: OPENROUTER_API_KEY is not set. ` +
        "Set it (and LLM_PRIMARY_MODEL to Jev's slug; GRADER_MODEL overrides for bake-offs) to run the LLM path.",
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
