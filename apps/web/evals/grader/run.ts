/**
 * Grader eval harness (plan P3.6 / P3.7; decision log "Grader = Jev decisions
 * + small-LLM escalation").
 *
 *   npm run eval:grader --workspace=@ibpe/web                       # deterministic + router (CI, no key)
 *   OPENROUTER_API_KEY=… npm run eval:grader --workspace=@ibpe/web -- --jev
 *   OPENROUTER_API_KEY=… npm run eval:grader --workspace=@ibpe/web -- --jev --no-escalation   # Jev alone
 *   OPENROUTER_API_KEY=… npm run eval:grader --workspace=@ibpe/web -- --small                 # chat-only baseline
 *   npm run eval:grader --workspace=@ibpe/web -- --verbose --json out.json
 *   … --no-router      every non-numeric case goes to the models
 *   … --floor 0.7      override JEV_CONFIDENCE_FLOOR for this run
 *   … --strict-llm     make the C12 targets fatal for model runs
 *
 * Always runs the deterministic grader (no key needed), enforces the CI
 * thresholds and reports the grade router (model call rate, deterministic
 * accuracy on skipped cases ≥ 0.95). `--jev` runs the production path — ONE
 * Jev decision request per routed case, small-model escalation only below the
 * confidence floor or on Jev error — and reports MAE / Spearman / correct
 * accuracy / injection resistance, Jev call rate, escalation rate and total
 * cost against the plan's C12 targets (MAE ≤ 0.12, correct accuracy ≥ 90%).
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
  type EvalCase,
  type EvalMetrics,
  type EvalResult,
} from "../../lib/grading/eval"
import { createGradeCaller, createGradeDecider, type GradeUsage } from "../../lib/grading/llm"

const here = dirname(fileURLToPath(import.meta.url))

function printMetrics(label: string, metrics: EvalMetrics) {
  console.log(`\n== ${label} ==`)
  console.log(
    `n=${metrics.n}  MAE=${metrics.mae}  Spearman=${metrics.spearman}  correct-accuracy=${metrics.correct_accuracy}  ` +
      `injection-resistance=${metrics.injection_resistance}  gaming-resistance=${metrics.gaming_resistance}  p95=${metrics.p95_latency_ms}ms`,
  )
  console.log(`sources: ${JSON.stringify(metrics.sources)}`)
  console.log(
    `router: model call rate=${metrics.router.llm_call_rate}  skipped=${metrics.router.skipped}  ` +
      `skipped correct-accuracy=${metrics.router.skipped_correct_accuracy}  reasons=${JSON.stringify(metrics.router.by_reason)}`,
  )
  console.log(
    `models: paths=${JSON.stringify(metrics.models.paths)}  Jev call rate=${metrics.models.jev_call_rate}  ` +
      `escalation rate=${metrics.models.escalation_rate}  small-LLM call rate=${metrics.models.small_call_rate}  ` +
      `cost=$${metrics.models.cost_usd.toFixed(6)}`,
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
        `grader=${r.score.toFixed(2)} correct=${r.correct}/${r.expected_correct} ${r.score_source} ` +
        `path=${r.route_path}${r.escalation ? `(${r.escalation})` : ""} router=${r.router_reason}`,
    )
  }
}

function usageSummary(usages: GradeUsage[]) {
  const served: Record<string, number> = {}
  for (const u of usages) served[`${u.kind}:${u.model}`] = (served[`${u.kind}:${u.model}`] ?? 0) + 1
  const total = (kind: GradeUsage["kind"]) => {
    const rows = usages.filter((u) => u.kind === kind)
    return {
      calls: rows.length,
      cost_usd: Number(rows.reduce((s, u) => s + (u.cost ?? 0), 0).toFixed(6)),
      input_tokens: rows.reduce((s, u) => s + (u.input_tokens ?? 0), 0),
      output_tokens: rows.reduce((s, u) => s + (u.output_tokens ?? 0), 0),
    }
  }
  return { served_by: served, decision: total("decision"), chat: total("chat") }
}

type ModelRun = {
  label: string
  key: string
  jev: boolean
  small: boolean
}

async function runModels(
  cases: EvalCase[],
  run: ModelRun,
  options: { useRouter: boolean; floor: number | undefined; verbose: boolean; strictLlm: boolean },
  report: Record<string, unknown>,
  failures: string[],
) {
  const config = gradeModelConfig()
  const floor = options.floor ?? config.confidenceFloor
  const usages: GradeUsage[] = []
  const decider = run.jev ? createGradeDecider({ config, onUsage: (u) => usages.push(u) }) : null
  const chat = run.small ? createGradeCaller({ config, onUsage: (u) => usages.push(u) }) : null
  const result = await runEval(cases, {
    decide: decider?.decide ?? null,
    decisionModel: decider?.model ?? null,
    confidenceFloor: floor,
    decisionTimeoutMs: 20_000,
    llm: chat?.caller ?? null,
    model: chat?.model ?? null,
    timeoutMs: 20_000,
    router: options.useRouter,
  })
  const label =
    `${run.label} (decision=${decider?.model ?? "-"}, chat=${chat?.model ?? "-"}, floor=${floor}` +
    `${options.useRouter ? ", router on" : ", router off"})`
  printMetrics(label, result.metrics)
  if (options.verbose) printResults(result.results)
  const usage = usageSummary(usages)
  console.log(
    `calls: Jev=${usage.decision.calls} ($${usage.decision.cost_usd}, ${usage.decision.input_tokens} input tokens)  ` +
      `small=${usage.chat.calls} ($${usage.chat.cost_usd}, ${usage.chat.input_tokens}/${usage.chat.output_tokens} tokens)  ` +
      `served-by=${JSON.stringify(usage.served_by)}`,
  )
  report[run.key] = {
    decision_model: decider?.model ?? null,
    chat_model: chat?.model ?? null,
    confidence_floor: floor,
    router_enabled: options.useRouter,
    usage,
    ...result.metrics,
  }
  const misses = checkThresholds(result.metrics, LLM_TARGETS)
  if (misses.length) {
    console.log(`${run.label} below C12 targets: ${misses.join("; ")}`)
    if (options.strictLlm) failures.push(...misses.map((m) => `${run.key}: ${m}`))
  }
}

async function main() {
  const args = process.argv.slice(2)
  const verbose = args.includes("--verbose")
  const strictLlm = args.includes("--strict-llm")
  const useRouter = !args.includes("--no-router")
  const wantJev = args.includes("--jev")
  const wantSmall = args.includes("--small")
  const noEscalation = args.includes("--no-escalation")
  const arg = (flag: string) => {
    const idx = args.indexOf(flag)
    return idx >= 0 ? args[idx + 1] : undefined
  }
  const jsonOut = arg("--json")
  const datasetPath = arg("--dataset") ?? join(here, "dataset.jsonl")
  const floorArg = arg("--floor")
  const floor = floorArg != null && Number.isFinite(Number(floorArg)) ? Number(floorArg) : undefined

  const cases = parseDataset(readFileSync(datasetPath, "utf8"))
  const report: Record<string, unknown> = { dataset: datasetPath, cases: cases.length }

  const deterministic = await runEval(cases, {})
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
    `\nmodels: decision=${config.decisionModel}  small chat=${config.chatModel}  ` +
      `JEV_CONFIDENCE_FLOOR=${floor ?? config.confidenceFloor}  route=${config.route}`,
  )
  const runOptions = { useRouter, floor, verbose, strictLlm }
  if ((wantJev || wantSmall) && !config.available) {
    console.log("\nModel runs skipped: OPENROUTER_API_KEY is not set (--jev / --small need it).")
  } else {
    if (wantJev) {
      await runModels(
        cases,
        noEscalation
          ? { label: "Jev only (no escalation)", key: "jev_only", jev: true, small: false }
          : { label: "Jev + small-LLM escalation", key: "jev", jev: true, small: true },
        runOptions,
        report,
        failures,
      )
    }
    if (wantSmall) {
      await runModels(cases, { label: "small chat model only", key: "small", jev: false, small: true }, runOptions, report, failures)
    }
    if (!wantJev && !wantSmall) {
      console.log("Model runs not requested: pass --jev (production path) and/or --small (chat-only baseline); both need OPENROUTER_API_KEY.")
    }
  }

  if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`)
  if (failures.length) {
    console.error(`\nFAIL: ${failures.join("; ")}`)
    process.exit(1)
  }
  console.log("\nPASS: deterministic grader meets CI thresholds")
}

void main()
