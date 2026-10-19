/**
 * Firm readiness (plan 2026-09-23-001 P5.4, KD-7) — the hero progress metric.
 *
 *   readiness(firm) = Σ heat_weight(topic) · concept_mastery(topic)
 *                     ─────────────────────────────────────────────
 *                              Σ heat_weight(topic)
 *
 * over the firm's tagged heat topics that map to a concept (lib/topics
 * conceptIdForTopic). heat_weight is the topic's heat intensity (occurrence
 * signal, ADR 0002 — signals weight readiness, they never become answers).
 * concept_mastery is the concept-level mastery record when one exists, else
 * the mean mastery of the learner's attempted questions in that topic; an
 * untouched concept counts as 0.
 *
 * A snapshot per firm per local day lands in app.readiness_snapshots so the
 * Today page can show "+N this week".
 */
import { inferTopic } from "@ibpe/search"
import type { FirmReadiness } from "@/lib/api/retention-schemas"
import { isDatabaseConfigured, requireSql } from "@/lib/db/client"
import { withRlsUserId } from "@/lib/db/rls"
import { addDays } from "@/lib/local-day"
import { conceptIdForTopic } from "@/lib/topics"
import { PROFICIENT_THRESHOLD, type ConceptStat } from "@/lib/achievements"
import { getStubMastery } from "./attempts"
import { getBankQuestion } from "./bank-fallback"
import { listMastery } from "./mastery"
import { memoryStore } from "./memory-store"
import { getMultiFirmHeat } from "./prep"
import { ensureAppUserQuery } from "./users"

export type HeatRow = { firm_id: string; topic_id: string; intensity: number; sample_size?: number }

export type ConceptMastery = {
  concept_id: string
  topic: string | null
  /** 0–1 mastery used for readiness. */
  score: number
  /** Questions in the topic with a graded attempt (roll-up). */
  attempted: number
  proficient: number
  source: "concept" | "rollup"
}

/* ------------------------------------------------------------------ */
/* Pure                                                                */
/* ------------------------------------------------------------------ */

export function computeFirmReadiness(
  heat: HeatRow[],
  mastery: Map<string, number>,
): { readiness: number | null; topics: FirmReadiness["topics"] } {
  const byTopic = new Map<string, { weight: number; sample: number }>()
  for (const row of heat) {
    if (row.topic_id === "untagged") continue
    if (!conceptIdForTopic(row.topic_id)) continue
    const weight = Math.max(0, Number(row.intensity) || 0)
    const prev = byTopic.get(row.topic_id) ?? { weight: 0, sample: 0 }
    byTopic.set(row.topic_id, {
      weight: Math.max(prev.weight, weight),
      sample: prev.sample + Math.max(0, Math.round(Number(row.sample_size) || 0)),
    })
  }
  const topics = [...byTopic.entries()]
    .map(([topic, { weight, sample }]) => {
      const conceptId = conceptIdForTopic(topic) as string
      const value = mastery.get(conceptId) ?? 0
      return {
        topic,
        concept_id: conceptId,
        weight,
        mastery: Math.min(1, Math.max(0, value)),
        sample_size: sample,
      }
    })
    .sort((a, b) => b.weight - a.weight || a.topic.localeCompare(b.topic))
  const totalWeight = topics.reduce((sum, t) => sum + t.weight, 0)
  if (totalWeight <= 0) return { readiness: null, topics }
  const readiness = topics.reduce((sum, t) => sum + t.weight * t.mastery, 0) / totalWeight
  return { readiness: Math.min(1, Math.max(0, readiness)), topics }
}

export type ReadinessSnapshot = { local_date: string; readiness: number }

/**
 * Change vs a week ago: baseline is the latest snapshot on or before
 * today−7; a learner younger than a week is compared with their first
 * snapshot before today. Null when there is no earlier snapshot.
 */
export function weeklyDelta(
  current: number | null,
  snapshots: ReadinessSnapshot[],
  today: string,
): number | null {
  if (current == null) return null
  const weekAgo = addDays(today, -7)
  const earlier = snapshots.filter((s) => s.local_date < today).sort((a, b) => a.local_date.localeCompare(b.local_date))
  if (earlier.length === 0) return null
  const onOrBefore = earlier.filter((s) => s.local_date <= weekAgo)
  const baseline = onOrBefore.length > 0 ? onOrBefore[onOrBefore.length - 1] : earlier[0]
  if (!baseline) return null
  return Math.round((current - baseline.readiness) * 1000) / 1000
}

/** Roll question mastery up to concepts by question topic. */
export function rollUpConceptMastery(
  questionRows: Array<{ topic: string | null; mastery: number }>,
  conceptRows: Array<{ concept_id: string; mastery: number }>,
): Map<string, ConceptMastery> {
  const out = new Map<string, ConceptMastery>()
  const sums = new Map<string, { topic: string; total: number; n: number; proficient: number }>()
  for (const row of questionRows) {
    const topic = row.topic
    if (!topic) continue
    const conceptId = conceptIdForTopic(topic)
    if (!conceptId) continue
    const bucket = sums.get(conceptId) ?? { topic, total: 0, n: 0, proficient: 0 }
    bucket.total += row.mastery
    bucket.n += 1
    if (row.mastery >= PROFICIENT_THRESHOLD) bucket.proficient += 1
    sums.set(conceptId, bucket)
  }
  for (const [conceptId, bucket] of sums) {
    out.set(conceptId, {
      concept_id: conceptId,
      topic: bucket.topic,
      score: bucket.n > 0 ? bucket.total / bucket.n : 0,
      attempted: bucket.n,
      proficient: bucket.proficient,
      source: "rollup",
    })
  }
  for (const row of conceptRows) {
    const existing = out.get(row.concept_id)
    out.set(row.concept_id, {
      concept_id: row.concept_id,
      topic: existing?.topic ?? null,
      score: Math.min(1, Math.max(0, row.mastery)),
      attempted: existing?.attempted ?? 0,
      proficient: existing?.proficient ?? 0,
      source: "concept",
    })
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

/** Concept mastery for readiness, weak-concept picks and "concept cleared". */
export async function loadConceptMastery(userId: string): Promise<Map<string, ConceptMastery>> {
  const listed = await listMastery(userId)
  const conceptRows = listed.items
    .filter((item) => item.subject_type === "concept")
    .map((item) => ({ concept_id: item.subject_id, mastery: item.score }))

  if (listed.source === "published" && isDatabaseConfigured()) {
    try {
      const sql = requireSql()
      const results = await withRlsUserId(sql, userId, (s) => [
        s`
          SELECT q.topic, m.mastery
          FROM app.mastery_records m
          JOIN app.users u ON u.id = m.user_id
          JOIN published.v_questions q ON q.id = m.question_id
          WHERE u.neon_auth_user_id = ${userId} AND m.question_id IS NOT NULL
        `,
      ])
      const rows = (results[0] ?? []) as Array<{ topic: string | null; mastery: number }>
      return rollUpConceptMastery(
        rows.map((row) => ({ topic: row.topic, mastery: Number(row.mastery) })),
        conceptRows,
      )
    } catch (err) {
      console.warn("[readiness] question mastery roll-up failed", err)
      return rollUpConceptMastery([], conceptRows)
    }
  }

  // In-memory: bank questions carry no topic, so infer it from the wording.
  const questionRows = await Promise.all(
    getStubMastery(userId)
      .filter((item) => item.subject_type === "canonical_question")
      .map(async (item) => {
        const bank = await getBankQuestion(item.subject_id)
        const inferred = bank ? inferTopic(bank.question.canonical_wording) : null
        return {
          topic: bank?.question.topic ?? (inferred && inferred !== "untagged" ? inferred : null),
          mastery: item.score,
        }
      }),
  )
  return rollUpConceptMastery(questionRows, conceptRows)
}

export function conceptStatsFrom(mastery: Map<string, ConceptMastery>): ConceptStat[] {
  return [...mastery.values()].map((entry) => ({
    concept_id: entry.concept_id,
    topic: entry.topic,
    attempted: entry.attempted,
    proficient: entry.proficient,
  }))
}

const stubSnapshots = memoryStore<string, Map<string, ReadinessSnapshot[]>>("readiness_snapshots")

function stubSnapshotsFor(userId: string): Map<string, ReadinessSnapshot[]> {
  let byFirm = stubSnapshots.get(userId)
  if (!byFirm) {
    byFirm = new Map()
    stubSnapshots.set(userId, byFirm)
  }
  return byFirm
}

async function loadSnapshots(
  userId: string,
  since: string,
): Promise<Map<string, ReadinessSnapshot[]>> {
  if (!isDatabaseConfigured()) return stubSnapshotsFor(userId)
  try {
    const sql = requireSql()
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT r.firm_id, r.local_date::text AS local_date, r.readiness
        FROM app.readiness_snapshots r
        JOIN app.users u ON u.id = r.user_id
        WHERE u.neon_auth_user_id = ${userId} AND r.local_date >= ${since}::date
        ORDER BY r.local_date
      `,
    ])
    const rows = (results[0] ?? []) as Array<{ firm_id: string; local_date: string; readiness: number }>
    const byFirm = new Map<string, ReadinessSnapshot[]>()
    for (const row of rows) {
      const list = byFirm.get(row.firm_id) ?? []
      list.push({ local_date: row.local_date, readiness: Number(row.readiness) })
      byFirm.set(row.firm_id, list)
    }
    return byFirm
  } catch (err) {
    console.warn("[readiness] snapshot read failed", err)
    return stubSnapshotsFor(userId)
  }
}

async function saveSnapshots(options: {
  userId: string
  email?: string | null
  today: string
  rows: FirmReadiness[]
}): Promise<void> {
  const { userId, email, today } = options
  const rows = options.rows.filter((row) => row.readiness != null)
  if (rows.length === 0) return
  const writeStub = () => {
    const byFirm = stubSnapshotsFor(userId)
    for (const row of rows) {
      const list = (byFirm.get(row.firm_id) ?? []).filter((s) => s.local_date !== today)
      list.push({ local_date: today, readiness: row.readiness as number })
      byFirm.set(row.firm_id, list.slice(-60))
    }
  }
  if (!isDatabaseConfigured()) return writeStub()
  try {
    const sql = requireSql()
    await withRlsUserId(sql, userId, (s) => [
      ensureAppUserQuery(s, userId, email),
      ...rows.map(
        (row) => s`
          INSERT INTO app.readiness_snapshots (user_id, firm_id, local_date, readiness, detail_json)
          VALUES (
            (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
            ${row.firm_id},
            ${today}::date,
            ${row.readiness},
            ${JSON.stringify({ topics: row.topics })}::jsonb
          )
          ON CONFLICT (user_id, firm_id, local_date) DO UPDATE SET
            readiness = EXCLUDED.readiness,
            detail_json = EXCLUDED.detail_json
        `,
      ),
    ])
  } catch (err) {
    console.warn("[readiness] snapshot write failed; keeping in memory", err)
    writeStub()
  }
}

/**
 * Readiness for each firm (target set order), with weekly delta; snapshots
 * today's value unless `persist` is false.
 */
export async function getFirmReadiness(options: {
  userId: string
  email?: string | null
  firmIds: string[]
  today: string
  persist?: boolean
  mastery?: Map<string, ConceptMastery>
}): Promise<FirmReadiness[]> {
  const firmIds = [...new Set(options.firmIds.filter(Boolean))].slice(0, 6)
  if (firmIds.length === 0) return []
  const [heat, masteryMap, snapshots] = await Promise.all([
    getMultiFirmHeat(firmIds),
    options.mastery ? Promise.resolve(options.mastery) : loadConceptMastery(options.userId),
    loadSnapshots(options.userId, addDays(options.today, -21)),
  ])
  const scores = new Map([...masteryMap.values()].map((entry) => [entry.concept_id, entry.score]))
  const rows: FirmReadiness[] = heat.firms.map((firm) => {
    const { readiness, topics } = computeFirmReadiness(
      heat.topics.filter((row) => row.firm_id === firm.id),
      scores,
    )
    return {
      firm_id: firm.id,
      firm_name: firm.name,
      readiness,
      weekly_delta: weeklyDelta(readiness, snapshots.get(firm.id) ?? [], options.today),
      topics,
    }
  })
  if (options.persist !== false) {
    await saveSnapshots({ userId: options.userId, email: options.email, today: options.today, rows })
  }
  return rows
}
