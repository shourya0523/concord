/**
 * Numeric drills (plan 2026-09-23-001 P2.8, KD-3): pick a seeded template,
 * re-generate it from its id at grading time and check the learner's number
 * against the calculator answer with the template's tolerance. No LLM.
 *
 * Persistence: app.drill_attempts (migration 043) under RLS; in-memory when
 * DATABASE_URL is unset or the write fails, like lib/data/attempts.ts.
 */
import { randomUUID } from "node:crypto"
import type { DrillInstance, DrillSolution, Mastery } from "@ibpe/contracts"
import {
  allowedError,
  generateDrill,
  listDrillTemplates,
  parseDrillId,
  withinTolerance,
  type DrillTemplateMeta,
  type GeneratedDrill,
} from "@ibpe/domain"
import type {
  DrillAttemptResponse,
  DrillNextResponse,
  DrillTemplatesResponse,
  DrillTemplateSummary,
} from "@/lib/api/drill-schemas"
import { isDatabaseConfigured, requireSql } from "@/lib/db/client"
import { withRlsUserId } from "@/lib/db/rls"
import { WEAK_THRESHOLD } from "@/lib/weak-topics"
import { recordLearningActivity } from "./activity"
import { listMastery } from "./mastery"
import { memoryStore } from "./memory-store"
import { ensureAppUserQuery } from "./users"

/* ------------------------------------------------------------------ */
/* Number parsing                                                     */
/* ------------------------------------------------------------------ */

export type ParsedUserNumber = {
  /** Signed number as typed, before any scale suffix is applied. */
  value: number
  percent: boolean
  multiple: boolean
  scale: "bn" | "mm" | "k" | null
}

const NUMBER_RE =
  /(\()?\s*([-−–—+])?\s*\$?\s*([-−])?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s*(%|percent\b|pct\b|bps\b|x\b|×|bn\b|billion\b|b\b|mm\b|mn\b|million\b|m\b|k\b|thousand\b)?\s*(\))?/gi

const ANSWER_MARKER_RE = /(?:=|≈|~|→|->)/g

const NEGATIVE_WORDS_RE =
  /\b(?:dilut\w*|decreas\w*|down|lower|reduc\w*|negative|minus|outflow|use of cash|falls?|drops?|declines?)\b/i

/** Mixed wording ("accretion/(dilution) of 3%") must not flip the sign. */
const POSITIVE_WORDS_RE =
  /\b(?:accret\w*|increas\w*|up|higher|inflow|source of cash|rises?|grows?|gains?)\b/i

type Token = ParsedUserNumber & { start: number; end: number; signed: boolean; dash: boolean }

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  for (const m of text.matchAll(NUMBER_RE)) {
    const [whole, open, sign1, sign2, digits, suffixRaw, close] = m
    if (!digits) continue
    let value = Number(digits.replace(/,/g, ""))
    if (!Number.isFinite(value)) continue
    const sign = sign1 ?? sign2 ?? ""
    const negative = /[-−–—]/.test(sign) || Boolean(open && close)
    if (negative) value = -value
    const suffix = (suffixRaw ?? "").toLowerCase()
    let percent = suffix === "%" || suffix === "percent" || suffix === "pct"
    if (suffix === "bps") {
      value /= 100
      percent = true
    }
    const scale =
      suffix === "bn" || suffix === "billion" || suffix === "b"
        ? "bn"
        : suffix === "mm" || suffix === "mn" || suffix === "million" || suffix === "m"
          ? "mm"
          : suffix === "k" || suffix === "thousand"
            ? "k"
            : null
    tokens.push({
      value,
      percent,
      multiple: suffix === "x" || suffix === "×",
      scale,
      start: (m.index ?? 0) + whole.indexOf(digits) - (sign ? 1 : 0),
      end: (m.index ?? 0) + whole.length,
      signed: sign !== "" || Boolean(open && close),
      dash: /[-–—]/.test(sign1 ?? ""),
    })
  }
  return tokens
}

/**
 * Extract the learner's answer from free text: `$1.2bn`, `7.5%`, `2.3x`,
 * `(40)`, `-2.5%`, `1,250`, `50bps`, `14-15%` (midpoint), `… = 7.5`.
 * When the text shows working, the number after the last `=`/`≈`/`→` wins;
 * otherwise the first number does. Words like "dilutive" or "decrease"
 * negate an unsigned number. Returns null when there is no number.
 */
export function parseUserNumber(text: string): ParsedUserNumber | null {
  const input = (text ?? "").slice(0, 500)
  const tokens = tokenize(input)
  if (tokens.length === 0) return null

  let startIdx = 0
  const markers = [...input.matchAll(ANSWER_MARKER_RE)]
  const lastMarker = markers.at(-1)
  if (lastMarker && lastMarker.index != null) {
    const after = tokens.findIndex((t) => t.start >= (lastMarker.index as number))
    if (after >= 0) startIdx = after
  }
  let chosen: Token = tokens[startIdx] as Token

  // Range "14-15%" / "14 to 15%" → midpoint, unit from whichever side has one.
  const next = tokens[startIdx + 1]
  if (next) {
    const between = input.slice(chosen.end, next.start)
    const dashRange = next.dash && /^\s*$/.test(between)
    const toRange = /^\s*(?:to|–|—|-)\s*$/i.test(between) && !next.signed
    if ((dashRange || toRange) && chosen.value >= 0) {
      const hi = Math.abs(next.value)
      chosen = {
        ...chosen,
        value: (chosen.value + hi) / 2,
        percent: chosen.percent || next.percent,
        multiple: chosen.multiple || next.multiple,
        scale: chosen.scale ?? next.scale,
      }
    }
  }

  let value = chosen.value
  if (
    !chosen.signed &&
    value > 0 &&
    NEGATIVE_WORDS_RE.test(input) &&
    !POSITIVE_WORDS_RE.test(input)
  ) {
    value = -value
  }
  return { value, percent: chosen.percent, multiple: chosen.multiple, scale: chosen.scale }
}

/** Candidate readings of a parsed number in the answer's unit. */
export function candidateValues(parsed: ParsedUserNumber, unit: string | null | undefined): number[] {
  const v = parsed.value
  switch (unit) {
    case "%":
      // "0.075" typed for 7.5% is a decimal answer — accept either reading.
      return parsed.percent ? [v] : [v, v * 100]
    case "$mm":
      if (parsed.scale === "bn") return [v * 1000]
      if (parsed.scale === "k") return [v / 1000]
      return [v]
    case "$bn":
      if (parsed.scale === "mm") return [v / 1000]
      return [v]
    default:
      return [v]
  }
}

export type DrillCheck = { found: number | null; correct: boolean; score: number }

/**
 * Exact numeric check: 1 inside tolerance, 0.5 when within 3× tolerance
 * (right method, arithmetic slip), else 0.
 */
export function checkDrillResponse(
  solution: Pick<DrillSolution, "answer" | "unit" | "tolerance" | "tolerance_kind">,
  responseText: string,
): DrillCheck {
  const parsed = parseUserNumber(responseText)
  if (!parsed) return { found: null, correct: false, score: 0 }
  const candidates = candidateValues(parsed, solution.unit)
  let best = candidates[0] as number
  for (const c of candidates) {
    if (Math.abs(c - solution.answer) < Math.abs(best - solution.answer)) best = c
  }
  const correct = withinTolerance(solution, best)
  const close = !correct && Math.abs(best - solution.answer) <= 3 * allowedError(solution) + 1e-9
  return {
    found: Math.round(best * 1e6) / 1e6,
    correct,
    score: correct ? 1 : close ? 0.5 : 0,
  }
}

/* ------------------------------------------------------------------ */
/* Template choice                                                    */
/* ------------------------------------------------------------------ */

export type TemplateStats = { attempts: number; correct: number; last_attempt_at: string | null }

/**
 * Weighted template choice. Weak concepts (mastery < WEAK_THRESHOLD) weigh
 * 3×, templates the learner keeps missing 2×, untried templates 1.5×, and
 * the most recently drilled template is damped so "Next" varies.
 */
export function pickTemplate(
  candidates: DrillTemplateMeta[],
  options: {
    weakConcepts?: ReadonlySet<string>
    stats?: ReadonlyMap<string, TemplateStats>
    lastTemplateId?: string | null
    rand?: () => number
  } = {},
): DrillTemplateMeta | null {
  if (candidates.length === 0) return null
  const rand = options.rand ?? Math.random
  const weights = candidates.map((t) => {
    let w = 1
    if (t.concept_id && options.weakConcepts?.has(t.concept_id)) w *= 3
    const s = options.stats?.get(t.id)
    if (!s || s.attempts === 0) w *= 1.5
    else if (s.correct / s.attempts < 0.6) w *= 2
    if (candidates.length > 1 && t.id === options.lastTemplateId) w *= 0.2
    return w
  })
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rand() * total
  for (let i = 0; i < candidates.length; i += 1) {
    r -= weights[i] as number
    if (r < 0) return candidates[i] as DrillTemplateMeta
  }
  return candidates[candidates.length - 1] as DrillTemplateMeta
}

export function newDrillSeed(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12)
}

function weakConceptsFrom(items: Array<Pick<Mastery, "subject_type" | "subject_id" | "score">>): Set<string> {
  return new Set(
    items
      .filter((m) => m.subject_type === "concept" && m.score < WEAK_THRESHOLD)
      .map((m) => m.subject_id),
  )
}

/* ------------------------------------------------------------------ */
/* Persistence                                                        */
/* ------------------------------------------------------------------ */

type StoredDrillAttempt = {
  id: string
  user_id: string
  drill_id: string
  template_id: string
  seed: string
  concept_id: string | null
  topic: string
  response_text: string
  response_value: number | null
  expected_value: number
  score: number
  correct: boolean
  time_spent_ms: number | null
  created_at: string
}

const stubDrillAttempts = memoryStore<string, StoredDrillAttempt[]>("drill_attempts")

function saveStub(attempt: StoredDrillAttempt) {
  const list = stubDrillAttempts.get(attempt.user_id) ?? []
  list.unshift(attempt)
  stubDrillAttempts.set(attempt.user_id, list.slice(0, 500))
}

export function listStubDrillAttempts(userId: string): StoredDrillAttempt[] {
  return [...(stubDrillAttempts.get(userId) ?? [])]
}

function statsFromAttempts(rows: StoredDrillAttempt[]): Map<string, TemplateStats> {
  const out = new Map<string, TemplateStats>()
  for (const row of rows) {
    const s = out.get(row.template_id) ?? { attempts: 0, correct: 0, last_attempt_at: null }
    s.attempts += 1
    if (row.correct) s.correct += 1
    if (!s.last_attempt_at || row.created_at > s.last_attempt_at) s.last_attempt_at = row.created_at
    out.set(row.template_id, s)
  }
  return out
}

type StatsRow = { template_id: string; attempts: number; correct: number; last_at: string | Date | null }

async function loadStats(
  userId: string,
): Promise<{ stats: Map<string, TemplateStats>; lastTemplateId: string | null; source: "published" | "stub" }> {
  const stub = () => {
    const rows = listStubDrillAttempts(userId)
    return { stats: statsFromAttempts(rows), lastTemplateId: rows[0]?.template_id ?? null, source: "stub" as const }
  }
  if (!isDatabaseConfigured()) return stub()
  try {
    const sql = requireSql()
    const [aggregate, latest] = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT d.template_id,
               count(*)::int AS attempts,
               count(*) FILTER (WHERE d.correct)::int AS correct,
               max(d.created_at) AS last_at
        FROM app.drill_attempts d
        JOIN app.users u ON u.id = d.user_id
        WHERE u.neon_auth_user_id = ${userId}
        GROUP BY d.template_id
      `,
      s`
        SELECT d.template_id
        FROM app.drill_attempts d
        JOIN app.users u ON u.id = d.user_id
        WHERE u.neon_auth_user_id = ${userId}
        ORDER BY d.created_at DESC
        LIMIT 1
      `,
    ])
    const stats = new Map<string, TemplateStats>()
    for (const row of (aggregate ?? []) as StatsRow[]) {
      stats.set(row.template_id, {
        attempts: Number(row.attempts),
        correct: Number(row.correct),
        last_attempt_at: row.last_at ? new Date(row.last_at).toISOString() : null,
      })
    }
    const last = ((latest ?? []) as Array<{ template_id: string }>)[0]?.template_id ?? null
    return { stats, lastTemplateId: last, source: "published" }
  } catch (err) {
    console.warn("[drills] stats read failed; using in-memory attempts", err)
    return stub()
  }
}

async function weakConceptsFor(userId: string): Promise<Set<string>> {
  try {
    return weakConceptsFrom((await listMastery(userId)).items)
  } catch (err) {
    console.warn("[drills] mastery read failed; no weak-concept weighting", err)
    return new Set()
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export function toDrillInstance(drill: GeneratedDrill): DrillInstance {
  return { ...drill.instance }
}

export async function listDrillTemplateSummaries(userId: string | null): Promise<DrillTemplatesResponse> {
  const loaded = userId ? await loadStats(userId) : null
  const items: DrillTemplateSummary[] = listDrillTemplates().map((t) => {
    const s = loaded?.stats.get(t.id)
    return {
      id: t.id,
      title: t.title,
      topic: t.topic,
      concept_id: t.concept_id,
      difficulty: t.difficulty,
      description: t.description ?? null,
      unit: t.unit ?? null,
      attempts: s?.attempts ?? 0,
      correct: s?.correct ?? 0,
      last_attempt_at: s?.last_attempt_at ?? null,
    }
  })
  return { items, source: loaded?.source ?? (isDatabaseConfigured() ? "published" : "stub") }
}

export async function nextDrill(options: {
  userId: string
  templateId?: string | null
  conceptId?: string | null
  difficulty?: DrillTemplateMeta["difficulty"] | null
  /** Test hooks. */
  seed?: string
  rand?: () => number
}): Promise<DrillNextResponse> {
  const all = listDrillTemplates()
  let candidates = all
  if (options.templateId) {
    candidates = all.filter((t) => t.id === options.templateId)
    if (candidates.length === 0) {
      return { drill: null, note: `Unknown drill template "${options.templateId}".` }
    }
  } else {
    if (options.conceptId) candidates = candidates.filter((t) => t.concept_id === options.conceptId)
    if (options.difficulty) candidates = candidates.filter((t) => t.difficulty === options.difficulty)
    if (candidates.length === 0) {
      return { drill: null, note: "No drill template matches that concept and difficulty." }
    }
  }

  let note: string | undefined
  let template: DrillTemplateMeta | null
  if (candidates.length === 1) {
    template = candidates[0] as DrillTemplateMeta
  } else {
    const [weakConcepts, loaded] = await Promise.all([
      weakConceptsFor(options.userId),
      loadStats(options.userId),
    ])
    template = pickTemplate(candidates, {
      weakConcepts,
      stats: loaded.stats,
      lastTemplateId: loaded.lastTemplateId,
      rand: options.rand,
    })
    if (template?.concept_id && weakConcepts.has(template.concept_id)) {
      note = "Picked from one of your weaker concepts."
    }
  }
  if (!template) return { drill: null, note: "No drill templates available." }

  const drill = generateDrill(template.id, options.seed ?? newDrillSeed())
  if (!drill) return { drill: null, note: "Drill generation failed." }
  return { drill: toDrillInstance(drill), ...(note ? { note } : {}) }
}

export class DrillNotFoundError extends Error {
  readonly status = 404
  constructor(drillId: string) {
    super(`Unknown drill "${drillId}"`)
    this.name = "DrillNotFoundError"
  }
}

export async function gradeDrill(options: {
  userId: string
  email?: string | null
  drillId: string
  responseText: string
  timeSpentMs?: number | null
}): Promise<DrillAttemptResponse> {
  const parsedId = parseDrillId(options.drillId)
  const drill = parsedId ? generateDrill(parsedId.templateId, parsedId.seed) : null
  if (!parsedId || !drill) throw new DrillNotFoundError(options.drillId)

  const check = checkDrillResponse(drill.solution, options.responseText)
  const now = new Date().toISOString()
  const attempt: StoredDrillAttempt = {
    id: `dra_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    user_id: options.userId,
    drill_id: drill.instance.id,
    template_id: drill.instance.template_id,
    seed: drill.instance.seed,
    concept_id: drill.instance.concept_id,
    topic: drill.instance.topic,
    response_text: options.responseText,
    response_value: check.found,
    expected_value: drill.solution.answer,
    score: check.score,
    correct: check.correct,
    time_spent_ms: options.timeSpentMs ?? null,
    created_at: now,
  }

  const source = await persistAttempt(attempt, options.email)

  let activity: DrillAttemptResponse["activity"] = null
  try {
    activity = await recordLearningActivity({
      userId: options.userId,
      email: options.email,
      kind: "drill",
      subjectId: drill.instance.id,
      score: check.score,
      scoreSource: "numeric",
      countsTowardGoal: true,
      at: new Date(now),
    })
  } catch (err) {
    console.warn("[drills] recordLearningActivity failed; attempt still saved", err)
  }

  return {
    drill_id: drill.instance.id,
    correct: check.correct,
    score: check.score,
    found: check.found,
    solution: { ...drill.solution },
    activity,
    source,
  }
}

async function persistAttempt(
  attempt: StoredDrillAttempt,
  email?: string | null,
): Promise<"published" | "stub"> {
  if (!isDatabaseConfigured()) {
    saveStub(attempt)
    return "stub"
  }
  try {
    const sql = requireSql()
    await withRlsUserId(sql, attempt.user_id, (s) => [
      ensureAppUserQuery(s, attempt.user_id, email),
      s`
        INSERT INTO app.drill_attempts (
          id, user_id, template_id, seed, concept_id, topic, response_text,
          response_value, expected_value, score, correct, time_spent_ms, created_at
        )
        VALUES (
          ${attempt.id},
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${attempt.user_id} LIMIT 1),
          ${attempt.template_id},
          ${attempt.seed},
          ${attempt.concept_id},
          ${attempt.topic},
          ${attempt.response_text},
          ${attempt.response_value},
          ${attempt.expected_value},
          ${attempt.score},
          ${attempt.correct},
          ${attempt.time_spent_ms},
          ${attempt.created_at}::timestamptz
        )
      `,
    ])
    return "published"
  } catch (err) {
    console.warn("[drills] DB write failed; saving drill attempt in memory", err)
    saveStub(attempt)
    return "stub"
  }
}
