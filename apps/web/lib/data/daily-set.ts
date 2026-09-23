/**
 * Daily set (plan 2026-09-23-001 P4.3). One frozen set of cards per user per
 * local day, stored in app.daily_sets.items_json:
 *
 *   1. due spaced reviews (app.review_queue due_at ≤ now), oldest first, capped
 *   2. 1–2 new questions — weak concepts (mastery), else plan / target-firm
 *      heat topics, else the published bank — topping the set up to size
 *   3. 1 firm-heat item for the primary target firm
 *   4. 1 numeric drill (when drill templates exist)
 *
 * Size comes from profile.availability_minutes (~1.5 min per card, default 8,
 * clamped 5–15). Building is idempotent per (user, local day): the first build
 * wins and later calls return the stored set. Only item completion
 * (`done_at`, `score`) changes after creation.
 */
import { createHash } from "node:crypto"
import { generateDrill, listDrillTemplates, parseDrillId } from "@ibpe/domain"
import { inferTopic } from "@ibpe/search"
import type { DrillInstance } from "@ibpe/contracts"
import {
  DailySetItemSchema,
  type DailySet,
  type DailySetItem,
  type DailySetResponse,
} from "@/lib/api/retention-schemas"
import { isDatabaseConfigured, requireSql } from "@/lib/db/client"
import { withRlsUserId } from "@/lib/db/rls"
import { localDate, safeTimeZone } from "@/lib/local-day"
import { conceptIdForTopic, topicForConceptId, topicLabel } from "@/lib/topics"
import { WEAK_THRESHOLD } from "@/lib/weak-topics"
import { listStubAttempts } from "./attempts"
import { getBankQuestion, loadBankQuestions } from "./bank-fallback"
import { memoryStore } from "./memory-store"
import { getMultiFirmHeat } from "./prep"
import { getPrepProfile } from "./profile"
import { listQuestions } from "./questions"
import { loadConceptMastery } from "./readiness"
import { listDueReviews } from "./review"
import { getStudyPlan } from "./study-plan"
import { getTargetCompanySet } from "./targets"
import { ensureAppUserQuery } from "./users"

export const MINUTES_PER_CARD = 1.5
export const DEFAULT_SET_SIZE = 8
export const MIN_SET_SIZE = 5
export const MAX_SET_SIZE = 15

/* ------------------------------------------------------------------ */
/* Pure composition                                                    */
/* ------------------------------------------------------------------ */

export type QuestionCandidate = {
  question_id: string
  prompt: string
  topic: string | null
  difficulty: string | null
  reason: string
  firm_id?: string | null
}

export function dailySetSize(availabilityMinutes: number | null | undefined): number {
  if (availabilityMinutes == null || !Number.isFinite(availabilityMinutes) || availabilityMinutes <= 0) {
    return DEFAULT_SET_SIZE
  }
  return Math.min(MAX_SET_SIZE, Math.max(MIN_SET_SIZE, Math.round(availabilityMinutes / MINUTES_PER_CARD)))
}

export function estimatedMinutes(cards: number): number {
  return Math.round(cards * MINUTES_PER_CARD)
}

function questionItem(kind: DailySetItem["kind"], candidate: QuestionCandidate): DailySetItem {
  return DailySetItemSchema.parse({
    id: `${kind}:${candidate.question_id}`,
    kind,
    subject_id: candidate.question_id,
    question_id: candidate.question_id,
    prompt: candidate.prompt,
    topic: candidate.topic,
    concept_id: candidate.topic ? conceptIdForTopic(candidate.topic) : null,
    firm_id: candidate.firm_id ?? null,
    difficulty: candidate.difficulty,
    reason: candidate.reason,
  })
}

function drillItem(drill: DrillInstance, reason: string): DailySetItem {
  return DailySetItemSchema.parse({
    id: `drill:${drill.id}`,
    kind: "drill",
    subject_id: drill.id,
    question_id: null,
    prompt: drill.prompt,
    topic: drill.topic,
    concept_id: drill.concept_id ?? null,
    difficulty: drill.difficulty,
    reason,
    drill,
  })
}

/**
 * Compose the set. Reviews first (capped so new, firm-heat and drill slots
 * survive), then new questions topping up to `size`, then the firm-heat item
 * and the drill. Every question appears at most once.
 */
export function composeDailySet(input: {
  size: number
  due: QuestionCandidate[]
  fresh: QuestionCandidate[]
  firmHeat: QuestionCandidate | null
  drill: { instance: DrillInstance; reason: string } | null
}): DailySetItem[] {
  const size = Math.max(1, input.size)
  const seen = new Set<string>()
  const take = (candidate: QuestionCandidate | null | undefined) => {
    if (!candidate || seen.has(candidate.question_id)) return false
    seen.add(candidate.question_id)
    return true
  }
  const firmHeat = input.firmHeat
  const extras = (firmHeat ? 1 : 0) + (input.drill ? 1 : 0)
  const newTarget = size >= DEFAULT_SET_SIZE ? 2 : 1
  const reviewCap = Math.max(0, size - extras - newTarget)

  const reviews: DailySetItem[] = []
  for (const candidate of input.due) {
    if (reviews.length >= reviewCap) break
    if (firmHeat && candidate.question_id === firmHeat.question_id) continue
    if (take(candidate)) reviews.push(questionItem("review", candidate))
  }
  const firmItem = firmHeat && take(firmHeat) ? questionItem("firm_heat", firmHeat) : null
  const freshSlots = Math.max(0, size - reviews.length - (firmItem ? 1 : 0) - (input.drill ? 1 : 0))
  const fresh: DailySetItem[] = []
  for (const candidate of input.fresh) {
    if (fresh.length >= freshSlots) break
    if (take(candidate)) fresh.push(questionItem("new", candidate))
  }
  const items = [...reviews, ...fresh]
  if (firmItem) items.push(firmItem)
  if (input.drill) items.push(drillItem(input.drill.instance, input.drill.reason))
  return items.slice(0, size)
}

/** Recount completion from item state. */
export function summariseItems(items: DailySetItem[]): { completed: number; allDone: boolean } {
  const completed = items.filter((item) => item.done_at).length
  return { completed, allDone: items.length > 0 && completed >= items.length }
}

/** Mark the first open item for `subjectId` done (pure; returns null when none). */
export function markItemDone(
  items: DailySetItem[],
  subjectId: string,
  score: number | null,
  at: string,
): DailySetItem[] | null {
  const index = items.findIndex((item) => item.subject_id === subjectId && !item.done_at)
  if (index < 0) return null
  return items.map((item, i) =>
    i === index
      ? { ...item, done_at: at, score: score == null ? null : Math.min(1, Math.max(0, score)) }
      : item,
  )
}

/** Stable, url-safe drill seed for a user's day. */
export function drillSeed(userId: string, day: string): string {
  const digest = createHash("sha256").update(`${userId}|${day}`).digest("hex").slice(0, 8)
  return `d${day.replace(/-/g, "")}${digest}`
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

type StoredSet = DailySet & { user_id: string }

const stubSets = memoryStore<string, StoredSet>("daily_sets")
const setKey = (userId: string, day: string) => `${userId}|${day}`

type SetRow = {
  local_date: string
  items_json: unknown
  goal: number
  completed_count: number
  completed_at: string | null
}

function parseItems(raw: unknown): DailySetItem[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    const parsed = DailySetItemSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

function rowToSet(row: SetRow, timezone: string): DailySet {
  const items = parseItems(row.items_json)
  return {
    local_date: row.local_date,
    timezone,
    goal: Number(row.goal),
    items,
    completed_count: Number(row.completed_count),
    completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    estimated_minutes: estimatedMinutes(items.length),
  }
}

/** Stored set for a local day, or null (never builds). */
export async function readDailySet(
  userId: string,
  day: string,
  timezone = "UTC",
): Promise<{ set: DailySet; source: "published" | "stub" } | null> {
  const stub = stubSets.get(setKey(userId, day))
  if (!isDatabaseConfigured()) return stub ? { set: stub, source: "stub" } : null
  try {
    const sql = requireSql()
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT ds.local_date::text AS local_date, ds.items_json, ds.goal, ds.completed_count, ds.completed_at
        FROM app.daily_sets ds
        JOIN app.users u ON u.id = ds.user_id
        WHERE u.neon_auth_user_id = ${userId} AND ds.local_date = ${day}::date
        LIMIT 1
      `,
    ])
    const row = ((results[0] ?? []) as SetRow[])[0]
    if (row) return { set: rowToSet(row, timezone), source: "published" }
    return stub ? { set: stub, source: "stub" } : null
  } catch (err) {
    console.warn("[daily-set] read failed", err)
    return stub ? { set: stub, source: "stub" } : null
  }
}

/** In-memory item completion (the DB path marks items inside the activity batch). */
export function markStubDailySetItem(
  userId: string,
  day: string,
  subjectId: string,
  score: number | null,
  at: string,
): DailySet | null {
  const key = setKey(userId, day)
  const stored = stubSets.get(key)
  if (!stored) return null
  const items = markItemDone(stored.items, subjectId, score, at)
  if (!items) return stored
  const { completed, allDone } = summariseItems(items)
  const next: StoredSet = {
    ...stored,
    items,
    completed_count: completed,
    completed_at: allDone ? (stored.completed_at ?? at) : stored.completed_at,
  }
  stubSets.set(key, next)
  return next
}

export function getStubDailySet(userId: string, day: string): DailySet | null {
  return stubSets.get(setKey(userId, day)) ?? null
}

/* ------------------------------------------------------------------ */
/* Candidate loading                                                   */
/* ------------------------------------------------------------------ */

type QuestionMeta = { id: string; prompt: string; topic: string | null; difficulty: string | null }

const inferredTopicCache = new Map<string, string | null>()

/** Keyword-rule topic for untagged bank wording (cached; bank rows are static). */
function inferredTopic(text: string): string | null {
  const cached = inferredTopicCache.get(text)
  if (cached !== undefined) return cached
  const topic = inferTopic(text)
  const value = topic && topic !== "untagged" ? topic : null
  if (inferredTopicCache.size < 20_000) inferredTopicCache.set(text, value)
  return value
}

/** Wording + topic for question ids (published view; bank fallback). */
export async function loadQuestionMeta(ids: string[]): Promise<Map<string, QuestionMeta>> {
  const out = new Map<string, QuestionMeta>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return out
  if (isDatabaseConfigured()) {
    try {
      const sql = requireSql()
      const rows = (await sql`
        SELECT id, canonical_wording, topic, difficulty
        FROM published.v_questions
        WHERE id = ANY(${unique}::text[])
      `) as Array<{ id: string; canonical_wording: string; topic: string | null; difficulty: string | null }>
      for (const row of rows) {
        out.set(row.id, {
          id: row.id,
          prompt: row.canonical_wording,
          topic: row.topic,
          difficulty: row.difficulty,
        })
      }
    } catch (err) {
      console.warn("[daily-set] question meta read failed", err)
    }
  }
  for (const id of unique) {
    if (out.has(id)) continue
    const bank = await getBankQuestion(id)
    if (!bank) continue
    out.set(id, {
      id,
      prompt: bank.question.canonical_wording,
      topic: bank.question.topic ?? inferredTopic(bank.question.canonical_wording),
      difficulty: bank.question.difficulty ?? null,
    })
  }
  return out
}

/** Published questions for topics (random order), excluding ids. */
async function questionsForTopics(
  topics: string[],
  exclude: Set<string>,
  limit: number,
): Promise<QuestionMeta[]> {
  if (topics.length === 0 || limit <= 0) return []
  if (isDatabaseConfigured()) {
    try {
      const sql = requireSql()
      const rows = (await sql`
        SELECT id, canonical_wording, topic, difficulty
        FROM published.v_questions
        WHERE topic = ANY(${topics}::text[])
          AND NOT (id = ANY(${[...exclude]}::text[]))
        ORDER BY random()
        LIMIT ${limit * 4}
      `) as Array<{ id: string; canonical_wording: string; topic: string | null; difficulty: string | null }>
      if (rows.length > 0) {
        // Keep topic priority order, then shuffle within.
        const rank = new Map(topics.map((topic, i) => [topic, i]))
        return rows
          .sort((a, b) => (rank.get(a.topic ?? "") ?? 99) - (rank.get(b.topic ?? "") ?? 99))
          .slice(0, limit)
          .map((row) => ({
            id: row.id,
            prompt: row.canonical_wording,
            topic: row.topic,
            difficulty: row.difficulty,
          }))
      }
    } catch (err) {
      console.warn("[daily-set] topic question read failed", err)
    }
  }
  // Local bank: infer topics from wording.
  const bank = await loadBankQuestions()
  const wanted = new Set(topics)
  const matches: QuestionMeta[] = []
  for (const row of bank) {
    if (exclude.has(row.id)) continue
    const topic = inferredTopic(row.question)
    if (!topic || !wanted.has(topic)) continue
    matches.push({ id: row.id, prompt: row.question, topic, difficulty: null })
    if (matches.length >= limit * 3) break
  }
  const rank = new Map(topics.map((topic, i) => [topic, i]))
  return matches
    .sort((a, b) => (rank.get(a.topic ?? "") ?? 99) - (rank.get(b.topic ?? "") ?? 99))
    .slice(0, limit)
}

/** Recently attempted question ids — "new" cards skip these. */
async function attemptedQuestionIds(userId: string): Promise<Set<string>> {
  const ids = new Set(listStubAttempts(userId).map((attempt) => attempt.canonical_question_id))
  if (!isDatabaseConfigured()) return ids
  try {
    const sql = requireSql()
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT DISTINCT a.question_id
        FROM app.question_attempts a
        JOIN app.users u ON u.id = a.user_id
        WHERE u.neon_auth_user_id = ${userId}
        LIMIT 2000
      `,
    ])
    for (const row of (results[0] ?? []) as Array<{ question_id: string }>) ids.add(row.question_id)
  } catch (err) {
    console.warn("[daily-set] attempted ids read failed", err)
  }
  return ids
}

function pickDrill(options: {
  userId: string
  day: string
  preferredTopics: string[]
}): { instance: DrillInstance; reason: string } | null {
  let templates: ReturnType<typeof listDrillTemplates> = []
  try {
    templates = listDrillTemplates()
  } catch (err) {
    console.warn("[daily-set] drill templates unavailable", err)
    return null
  }
  if (templates.length === 0) return null
  const preferred = templates.filter((t) => options.preferredTopics.includes(t.topic))
  const pool = preferred.length > 0 ? preferred : templates
  const dayIndex = Number(options.day.replace(/-/g, "")) || 0
  const seed = drillSeed(options.userId, options.day)
  for (let offset = 0; offset < pool.length; offset++) {
    const template = pool[(dayIndex + offset) % pool.length]
    if (!template) continue
    try {
      const generated = generateDrill(template.id, seed)
      if (!generated) continue
      const instance = { ...generated.instance, concept_id: generated.instance.concept_id ?? null }
      if (!parseDrillId(instance.id)) continue
      return {
        instance,
        reason: preferred.length > 0
          ? `Numeric drill on ${topicLabel(template.topic)} — checked exactly`
          : "Numeric drill — checked exactly, no AI needed",
      }
    } catch (err) {
      console.warn("[daily-set] drill generation failed", template.id, err)
    }
  }
  return null
}

/**
 * Target firms, never throwing: `getTargetCompanySet` rejects an empty set
 * (TargetCompanySetSchema.firm_ids is min(1)) for learners without targets.
 */
export async function safeTargetFirms(
  userId: string,
): Promise<{ firmIds: string[]; primaryFirmId: string | null }> {
  try {
    const { target_set } = await getTargetCompanySet(userId)
    return {
      firmIds: target_set.firm_ids,
      primaryFirmId: target_set.primary_firm_id ?? target_set.firm_ids[0] ?? null,
    }
  } catch {
    return { firmIds: [], primaryFirmId: null }
  }
}

async function buildDailySet(options: {
  userId: string
  day: string
  timezone: string
  availabilityMinutes: number | null
  now: Date
}): Promise<DailySet> {
  const { userId, day, now } = options
  const size = dailySetSize(options.availabilityMinutes)

  const [due, mastery, targets, plan] = await Promise.all([
    listDueReviews(userId, { now, limit: MAX_SET_SIZE }),
    loadConceptMastery(userId),
    safeTargetFirms(userId),
    getStudyPlan(userId).catch(() => null),
  ])

  const dueMeta = await loadQuestionMeta(due.items.map((item) => item.question_id))
  const dueCandidates: QuestionCandidate[] = due.items.flatMap((item) => {
    const meta = dueMeta.get(item.question_id)
    if (!meta) return []
    return [{
      question_id: meta.id,
      prompt: meta.prompt,
      topic: meta.topic,
      difficulty: meta.difficulty,
      reason: item.last_rating === "again" ? "Review — missed last time" : "Spaced review due today",
    }]
  })

  const attempted = await attemptedQuestionIds(userId)
  const exclude = new Set([...attempted, ...dueCandidates.map((c) => c.question_id)])

  // Weak concepts first (lowest mastery), then plan + target heat topics.
  const weak = [...mastery.values()]
    .filter((entry) => entry.score < WEAK_THRESHOLD)
    .sort((a, b) => a.score - b.score)
  const weakTopics = weak
    .map((entry) => entry.topic ?? topicForConceptId(entry.concept_id))
    .filter((topic): topic is string => Boolean(topic))

  const { firmIds, primaryFirmId } = targets
  const heat = firmIds.length > 0 ? await getMultiFirmHeat(firmIds) : null
  const heatRows = (heat?.topics ?? [])
    .filter((row) => row.topic_id !== "untagged")
    .sort((a, b) => b.intensity - a.intensity)
  const firmName = (id: string | null) =>
    heat?.firms.find((firm) => firm.id === id)?.name ?? (id ? id.replace(/^firm_/, "").replace(/-/g, " ") : "")
  const planTopics = (plan?.plan.concept_ids ?? [])
    .map((id) => topicForConceptId(id))
    .filter((topic): topic is string => Boolean(topic))
  const heatTopics = [...new Set(heatRows.map((row) => row.topic_id))]

  const fresh: QuestionCandidate[] = []
  const pushFresh = (rows: QuestionMeta[], reasonFor: (row: QuestionMeta) => string) => {
    for (const row of rows) {
      if (exclude.has(row.id)) continue
      exclude.add(row.id)
      fresh.push({ question_id: row.id, prompt: row.prompt, topic: row.topic, difficulty: row.difficulty, reason: reasonFor(row) })
    }
  }
  /** At most `perTopic` per topic (variety), `total` overall, topics in priority order. */
  const spread = async (topics: string[], perTopic: number, total: number) => {
    const out: QuestionMeta[] = []
    for (const topic of topics) {
      if (out.length >= total) break
      const taken = new Set([...exclude, ...out.map((row) => row.id)])
      out.push(...(await questionsForTopics([topic], taken, Math.min(perTopic, total - out.length))))
    }
    return out
  }

  // Firm-heat card first so its topic is reserved: primary firm's hottest topic.
  let firmHeat: QuestionCandidate | null = null
  if (primaryFirmId) {
    const firmTopics = heatRows.filter((row) => row.firm_id === primaryFirmId).map((row) => row.topic_id)
    for (const topic of firmTopics.slice(0, 4)) {
      const [row] = await questionsForTopics([topic], exclude, 1)
      if (!row) continue
      exclude.add(row.id)
      firmHeat = {
        question_id: row.id,
        prompt: row.prompt,
        topic: row.topic,
        difficulty: row.difficulty,
        firm_id: primaryFirmId,
        reason: `${firmName(primaryFirmId)} heat: ${topicLabel(topic)} is one of their most-asked topics`,
      }
      break
    }
  }

  if (weakTopics.length > 0) {
    const rows = await spread(weakTopics, 2, Math.max(2, Math.ceil(size / 2)))
    pushFresh(rows, (row) => {
      const entry = weak.find((w) => (w.topic ?? topicForConceptId(w.concept_id)) === row.topic)
      return `Weak spot: ${topicLabel(row.topic ?? "")}${entry ? ` (${Math.round(entry.score * 100)}% mastery)` : ""}`
    })
  }
  const priorityTopics = [...new Set([...heatTopics, ...planTopics])]
  if (fresh.length < size && priorityTopics.length > 0) {
    const rows = await spread(priorityTopics, 2, size - fresh.length)
    pushFresh(rows, (row) =>
      heatTopics.includes(row.topic ?? "")
        ? `Hot at your targets: ${topicLabel(row.topic ?? "")}`
        : `On your plan: ${topicLabel(row.topic ?? "")}`,
    )
  }
  if (fresh.length < size) {
    const bank = await listQuestions({ limit: size * 3 })
    pushFresh(
      bank.items.map((q) => ({
        id: q.id,
        prompt: q.canonical_wording,
        topic: q.topic ?? inferredTopic(q.canonical_wording),
        difficulty: q.difficulty ?? null,
      })),
      () => (bank.source === "bank_fallback" ? "From the local question bank" : "New from the teaching bank"),
    )
  }

  const drill = pickDrill({ userId, day, preferredTopics: [...weakTopics, ...heatTopics] })
  const items = composeDailySet({ size, due: dueCandidates, fresh, firmHeat, drill })
  return {
    local_date: day,
    timezone: options.timezone,
    goal: items.length > 0 ? items.length : size,
    items,
    completed_count: 0,
    completed_at: null,
    estimated_minutes: estimatedMinutes(items.length),
  }
}

async function persistSet(options: {
  userId: string
  email?: string | null
  set: DailySet
}): Promise<{ set: DailySet; source: "published" | "stub" }> {
  const { userId, email, set } = options
  const saveStub = () => {
    const key = setKey(userId, set.local_date)
    const existing = stubSets.get(key)
    if (existing) return { set: existing as DailySet, source: "stub" as const }
    stubSets.set(key, { ...set, user_id: userId })
    return { set, source: "stub" as const }
  }
  if (!isDatabaseConfigured()) return saveStub()
  try {
    const sql = requireSql()
    const results = await withRlsUserId(sql, userId, (s) => [
      ensureAppUserQuery(s, userId, email),
      s`
        INSERT INTO app.daily_sets (user_id, local_date, items_json, goal)
        VALUES (
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
          ${set.local_date}::date,
          ${JSON.stringify(set.items)}::jsonb,
          ${set.goal}
        )
        ON CONFLICT (user_id, local_date) DO NOTHING
      `,
      s`
        INSERT INTO app.daily_activity (user_id, local_date, goal)
        VALUES (
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
          ${set.local_date}::date,
          ${set.goal}
        )
        ON CONFLICT (user_id, local_date) DO UPDATE SET
          goal = CASE WHEN app.daily_activity.goal_met THEN app.daily_activity.goal ELSE EXCLUDED.goal END,
          updated_at = now()
      `,
      s`
        SELECT ds.local_date::text AS local_date, ds.items_json, ds.goal, ds.completed_count, ds.completed_at
        FROM app.daily_sets ds
        JOIN app.users u ON u.id = ds.user_id
        WHERE u.neon_auth_user_id = ${userId} AND ds.local_date = ${set.local_date}::date
        LIMIT 1
      `,
    ])
    const row = ((results[3] ?? []) as SetRow[])[0]
    return { set: row ? rowToSet(row, set.timezone) : set, source: "published" }
  } catch (err) {
    console.warn("[daily-set] write failed; keeping set in memory", err)
    return saveStub()
  }
}

/** Today's set for the user — built once per local day, then frozen. */
export async function getOrCreateDailySet(options: {
  userId: string
  email?: string | null
  now?: Date
}): Promise<DailySetResponse> {
  const now = options.now ?? new Date()
  const { profile } = await getPrepProfile(options.userId)
  const timezone = safeTimeZone(profile.timezone)
  const day = localDate(now, timezone)

  const existing = await readDailySet(options.userId, day, timezone)
  if (existing) return { set: existing.set, source: existing.source }

  const built = await buildDailySet({
    userId: options.userId,
    day,
    timezone,
    availabilityMinutes: profile.availability_minutes,
    now,
  })
  const saved = await persistSet({ userId: options.userId, email: options.email, set: built })
  return {
    set: saved.set,
    source: saved.source,
    note:
      saved.set.items.length === 0
        ? "No questions available yet — answer anything in Study to count toward today's goal."
        : undefined,
  }
}

/** Evidence for completing an item: the learner's latest graded attempt on it (≤ 2 h old). */
export async function findItemEvidence(options: {
  userId: string
  item: DailySetItem
  now?: Date
}): Promise<{ score: number | null; scoreSource: string; responseEmpty: boolean } | null> {
  const { userId, item } = options
  const now = options.now ?? new Date()
  const cutoff = now.getTime() - 2 * 60 * 60 * 1000

  if (item.question_id) {
    const stub = listStubAttempts(userId)
      .filter((attempt) => attempt.canonical_question_id === item.question_id)
      .filter((attempt) => Date.parse(attempt.created_at) >= cutoff)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    if (stub) {
      const source = stub.score_source ?? "self"
      const score = stub.llm_score ?? stub.self_score ?? (stub.correct == null ? null : stub.correct ? 1 : 0)
      return { score, scoreSource: source, responseEmpty: !stub.response_text?.trim() }
    }
    if (!isDatabaseConfigured()) return null
    try {
      const sql = requireSql()
      const results = await withRlsUserId(sql, userId, (s) => [
        s`
          SELECT a.score, a.score_source, a.correctness, a.response_text
          FROM app.question_attempts a
          JOIN app.users u ON u.id = a.user_id
          WHERE u.neon_auth_user_id = ${userId}
            AND a.question_id = ${item.question_id}
            AND a.created_at >= ${new Date(cutoff).toISOString()}::timestamptz
          ORDER BY a.created_at DESC
          LIMIT 1
        `,
      ])
      const row = ((results[0] ?? []) as Array<{
        score: number | null
        score_source: string | null
        correctness: number | null
        response_text: string | null
      }>)[0]
      if (!row) return null
      const score = row.score != null ? Number(row.score) : row.correctness != null ? Number(row.correctness) : null
      return {
        score,
        scoreSource: row.score_source ?? (row.response_text?.trim() ? "deterministic" : "self"),
        responseEmpty: !row.response_text?.trim(),
      }
    } catch (err) {
      console.warn("[daily-set] attempt evidence read failed", err)
      return null
    }
  }

  const drill = parseDrillId(item.subject_id)
  if (drill && isDatabaseConfigured()) {
    try {
      const sql = requireSql()
      const results = await withRlsUserId(sql, userId, (s) => [
        s`
          SELECT d.score
          FROM app.drill_attempts d
          JOIN app.users u ON u.id = d.user_id
          WHERE u.neon_auth_user_id = ${userId}
            AND d.template_id = ${drill.templateId}
            AND d.seed = ${drill.seed}
            AND d.created_at >= ${new Date(cutoff).toISOString()}::timestamptz
          ORDER BY d.created_at DESC
          LIMIT 1
        `,
      ])
      const row = ((results[0] ?? []) as Array<{ score: number }>)[0]
      if (row) return { score: Number(row.score), scoreSource: "numeric", responseEmpty: false }
    } catch (err) {
      console.warn("[daily-set] drill evidence read failed", err)
    }
  }
  return null
}
