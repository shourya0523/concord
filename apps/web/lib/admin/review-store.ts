/**
 * Review queue persistence (plan P2.5) over staging.enrichment_proposals and
 * admin.review_tasks.
 *
 * Connection: ADMIN_DATABASE_URL when set, else DATABASE_URL. The web app's
 * runtime role (concord_app, migration 042) has no staging/admin grants, so
 * production review needs ADMIN_DATABASE_URL pointing at an owner-level role
 * (server-only env, never NEXT_PUBLIC_*).
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless"

import type {
  ProposalDecision,
  ProposalItem,
  ProposalListQuery,
  ProposalListResponse,
} from "@/lib/api/admin-schemas"

import {
  ProposalPlanError,
  diffJson,
  planProposalApplication,
  type ApplyPlan,
  type ProposalRow,
} from "./proposals"

type Sql = NeonQueryFunction<false, false>
type Query = ReturnType<Sql>

let cached: { url: string; sql: Sql } | null = null

export function adminDatabaseUrl(): string | null {
  return process.env.ADMIN_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || null
}

export function adminSql(): Sql | null {
  const url = adminDatabaseUrl()
  if (!url) return null
  if (!cached || cached.url !== url) cached = { url, sql: neon(url) }
  return cached.sql
}

export class ReviewStoreError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "ReviewStoreError"
  }
}

type Row = ProposalRow & {
  task_id: string | null
  task_status: string | null
  task_assignee: string | null
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function planError(row: ProposalRow): string | null {
  try {
    planProposalApplication(row)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/** Current canonical value for a proposal target (used when current_json is null). */
async function loadLiveCurrent(sql: Sql, row: ProposalRow): Promise<unknown | undefined> {
  const id = row.target_id
  try {
    switch (row.target_kind) {
      case "rubric": {
        const rows = (await sql`
          SELECT rubric_json FROM canonical.answers
          WHERE id = ${id} OR canonical_question_id = ${id}
          ORDER BY (id = ${id}) DESC, updated_at DESC
          LIMIT 1
        `) as Array<{ rubric_json: unknown }>
        return rows[0]?.rubric_json ?? undefined
      }
      case "question": {
        const rows = (await sql`
          SELECT topic, subtopic, difficulty, domain, question_type
          FROM canonical.canonical_questions WHERE id = ${id}
        `) as Array<Record<string, unknown>>
        const current = rows[0]
        if (!current) return undefined
        const single = ["topic", "subtopic", "difficulty", "domain", "question_type"]
        return single.includes(row.field) ? { [row.field]: current[row.field] } : current
      }
      case "answer": {
        const rows = (await sql`
          SELECT concise_answer, expanded_explanation, common_mistakes_json, follow_ups_json
          FROM canonical.answers WHERE id = ${id}
        `) as Array<Record<string, unknown>>
        return rows[0]?.[row.field]
      }
      case "diagram": {
        if (row.field === "title" || row.field === "a11y_fallback") {
          const rows = (await sql`
            SELECT title, a11y_fallback FROM canonical.diagrams WHERE id = ${id}
          `) as Array<Record<string, unknown>>
          return rows[0]?.[row.field]
        }
        const rows = (await sql`
          SELECT format, body FROM canonical.diagram_versions
          WHERE diagram_id = ${id}
          ORDER BY coalesce(nullif(regexp_replace(version, '[^0-9]', '', 'g'), ''), '0')::int DESC,
            created_at DESC
          LIMIT 1
        `) as Array<{ format: string; body: string }>
        return rows[0] ? { format: rows[0].format, body: rows[0].body } : undefined
      }
      case "lesson": {
        const rows = (await sql`
          SELECT body_markdown, question_ids FROM canonical.learning_module_checkpoints
          WHERE id = ${id}
        `) as Array<Record<string, unknown>>
        return rows[0]?.[row.field]
      }
      case "occurrence": {
        const rows = (await sql`
          SELECT topic, canonical_question_id, join_score, join_method
          FROM canonical.question_occurrences WHERE id = ${id}
        `) as Array<Record<string, unknown>>
        const current = rows[0]
        if (!current) return undefined
        return row.field === "topic" ? current.topic : current
      }
      default:
        return undefined
    }
  } catch (err) {
    console.warn("[admin] live current lookup failed", err)
    return undefined
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Shape the live value like the proposal so the diff is meaningful. */
export function comparable(current: unknown, row: Pick<ProposalRow, "target_kind" | "field" | "proposal_json">): unknown {
  const proposal = row.proposal_json
  // Single-field proposal (e.g. topic: "lbo") vs a row object → compare the field.
  if (!isPlainObject(proposal) && isPlainObject(current) && row.field in current) {
    return current[row.field]
  }
  // Taxonomy proposals only touch the keys they name.
  if (row.target_kind === "question" && isPlainObject(proposal) && isPlainObject(current)) {
    return Object.fromEntries(Object.keys(proposal).map((key) => [key, current[key] ?? null]))
  }
  // Diagram body proposals are often a bare string; compare against the body.
  if (
    row.target_kind === "diagram" &&
    typeof row.proposal_json === "string" &&
    current &&
    typeof current === "object" &&
    "body" in current
  ) {
    return (current as { body: unknown }).body
  }
  return current
}

async function toItem(sql: Sql, row: Row): Promise<ProposalItem> {
  let current: unknown = row.current_json
  let source: ProposalItem["current_source"] = "stored"
  if (current === null || current === undefined) {
    const live = await loadLiveCurrent(sql, row)
    current = live === undefined ? null : comparable(live, row)
    source = live === undefined ? "none" : "live"
  }
  return {
    id: row.id,
    target_kind: row.target_kind,
    target_id: row.target_id,
    field: row.field,
    proposal_json: row.proposal_json,
    current_json: current,
    current_source: source,
    model: row.model,
    prompt_version: row.prompt_version,
    confidence: row.confidence === null ? null : Number(row.confidence),
    status: row.status,
    auto_approved: Boolean(row.auto_approved),
    reviewer: row.reviewer,
    review_note: row.review_note,
    decided_at: iso(row.decided_at),
    created_at: iso(row.created_at) ?? "",
    review_task: row.task_id
      ? { id: row.task_id, status: row.task_status ?? "open", assignee: row.task_assignee }
      : null,
    diff: diffJson(current, row.proposal_json),
    plan_error: row.status === "pending" ? planError(row) : null,
  }
}

export async function listProposals(query: ProposalListQuery): Promise<ProposalListResponse> {
  const sql = adminSql()
  if (!sql) {
    return {
      items: [],
      total: 0,
      counts: {},
      limit: query.limit,
      offset: query.offset,
      source: "empty",
      note: "No database configured (set ADMIN_DATABASE_URL or DATABASE_URL).",
    }
  }
  const status = query.status === "all" ? null : query.status
  const kind = query.target_kind ?? null
  const q = query.q ? `%${query.q.replace(/[%_]/g, (m) => `\\${m}`)}%` : null
  const minConfidence = query.min_confidence ?? null

  const [rows, totals, counts] = (await sql.transaction([
    sql`
      SELECT p.*, t.id AS task_id, t.status AS task_status, t.assignee AS task_assignee
      FROM staging.enrichment_proposals p
      LEFT JOIN LATERAL (
        SELECT id, status, assignee FROM admin.review_tasks
        WHERE subject_type = 'enrichment_proposal' AND subject_id = p.id
        ORDER BY created_at DESC LIMIT 1
      ) t ON true
      WHERE (${status}::text IS NULL OR p.status = ${status})
        AND (${kind}::text IS NULL OR p.target_kind = ${kind})
        AND (${q}::text IS NULL OR p.target_id ILIKE ${q} OR p.field ILIKE ${q}
             OR p.proposal_json::text ILIKE ${q})
        AND (${minConfidence}::float8 IS NULL OR coalesce(p.confidence, 0) >= ${minConfidence})
      ORDER BY p.created_at DESC, p.id
      LIMIT ${query.limit} OFFSET ${query.offset}
    `,
    sql`
      SELECT count(*)::int AS total
      FROM staging.enrichment_proposals p
      WHERE (${status}::text IS NULL OR p.status = ${status})
        AND (${kind}::text IS NULL OR p.target_kind = ${kind})
        AND (${q}::text IS NULL OR p.target_id ILIKE ${q} OR p.field ILIKE ${q}
             OR p.proposal_json::text ILIKE ${q})
        AND (${minConfidence}::float8 IS NULL OR coalesce(p.confidence, 0) >= ${minConfidence})
    `,
    sql`
      SELECT status, count(*)::int AS n
      FROM staging.enrichment_proposals
      GROUP BY status
    `,
  ] as never)) as [Row[], Array<{ total: number }>, Array<{ status: string; n: number }>]

  const items: ProposalItem[] = []
  for (const row of rows) items.push(await toItem(sql, row))
  return {
    items,
    total: totals[0]?.total ?? 0,
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
    limit: query.limit,
    offset: query.offset,
    source: "published",
  }
}

async function loadRow(sql: Sql, id: string): Promise<Row | null> {
  const rows = (await sql`
    SELECT p.*, t.id AS task_id, t.status AS task_status, t.assignee AS task_assignee
    FROM staging.enrichment_proposals p
    LEFT JOIN LATERAL (
      SELECT id, status, assignee FROM admin.review_tasks
      WHERE subject_type = 'enrichment_proposal' AND subject_id = p.id
      ORDER BY created_at DESC LIMIT 1
    ) t ON true
    WHERE p.id = ${id}
  `) as Row[]
  return rows[0] ?? null
}

/** Fail fast (404) when the plan's target row is missing. */
async function assertTargetExists(sql: Sql, plan: ApplyPlan): Promise<void> {
  let rows: unknown[] = []
  switch (plan.kind) {
    case "rubric":
      rows = await sql`SELECT 1 FROM canonical.answers WHERE id = ${plan.target_id} OR canonical_question_id = ${plan.target_id} LIMIT 1`
      break
    case "question_taxonomy":
      rows = await sql`SELECT 1 FROM canonical.canonical_questions WHERE id = ${plan.question_id}`
      break
    case "answer_text":
    case "answer_list":
      rows = await sql`SELECT 1 FROM canonical.answers WHERE id = ${plan.answer_id}`
      break
    case "diagram_body":
    case "diagram_meta":
      rows = await sql`SELECT 1 FROM canonical.diagrams WHERE id = ${plan.diagram_id}`
      break
    case "lesson_body":
    case "lesson_questions":
      rows = await sql`SELECT 1 FROM canonical.learning_module_checkpoints WHERE id = ${plan.checkpoint_id}`
      break
    case "occurrence_topic":
    case "occurrence_join":
      rows = await sql`SELECT 1 FROM canonical.question_occurrences WHERE id = ${plan.occurrence_id}`
      break
  }
  if (rows.length === 0) {
    throw new ReviewStoreError(404, "target_not_found", `Target row for ${plan.kind} not found`)
  }
}

/** Canonical writes for an approved proposal (run inside one transaction). */
export function applyQueries(sql: Sql, plan: ApplyPlan): Query[] {
  switch (plan.kind) {
    case "rubric":
      return [
        sql`
          UPDATE canonical.answers
          SET rubric_json = ${JSON.stringify(plan.rubric)}::jsonb,
              rubric_status = 'approved',
              updated_at = now()
          WHERE id = ${plan.target_id} OR canonical_question_id = ${plan.target_id}
        `,
      ]
    case "question_taxonomy":
      return [
        sql`
          UPDATE canonical.canonical_questions
          SET topic = coalesce(${plan.set.topic ?? null}::text, topic),
              subtopic = coalesce(${plan.set.subtopic ?? null}::text, subtopic),
              difficulty = coalesce(${plan.set.difficulty ?? null}::text, difficulty),
              domain = coalesce(${plan.set.domain ?? null}::text, domain),
              question_type = coalesce(${plan.set.question_type ?? null}::text, question_type),
              updated_at = now()
          WHERE id = ${plan.question_id}
        `,
      ]
    case "answer_text":
      return plan.column === "concise_answer"
        ? [sql`UPDATE canonical.answers SET concise_answer = ${plan.value}, updated_at = now() WHERE id = ${plan.answer_id}`]
        : [sql`UPDATE canonical.answers SET expanded_explanation = ${plan.value}, updated_at = now() WHERE id = ${plan.answer_id}`]
    case "answer_list":
      return plan.column === "common_mistakes_json"
        ? [sql`UPDATE canonical.answers SET common_mistakes_json = ${JSON.stringify(plan.value)}::jsonb, updated_at = now() WHERE id = ${plan.answer_id}`]
        : [sql`UPDATE canonical.answers SET follow_ups_json = ${JSON.stringify(plan.value)}::jsonb, updated_at = now() WHERE id = ${plan.answer_id}`]
    case "diagram_body":
      return [
        sql`
          INSERT INTO canonical.diagram_versions (id, diagram_id, version, format, body)
          SELECT ${plan.diagram_id} || '_v' || s.n, ${plan.diagram_id}, s.n::text, ${plan.format}, ${plan.body}
          FROM (
            SELECT coalesce(max(nullif(regexp_replace(version, '[^0-9]', '', 'g'), '')::int), 0) + 1 AS n
            FROM canonical.diagram_versions
            WHERE diagram_id = ${plan.diagram_id}
          ) s
        `,
      ]
    case "diagram_meta":
      return plan.column === "title"
        ? [sql`UPDATE canonical.diagrams SET title = ${plan.value} WHERE id = ${plan.diagram_id}`]
        : [sql`UPDATE canonical.diagrams SET a11y_fallback = ${plan.value} WHERE id = ${plan.diagram_id}`]
    case "lesson_body":
      return [
        sql`
          UPDATE canonical.learning_module_checkpoints
          SET body_markdown = ${plan.body_markdown}, updated_at = now()
          WHERE id = ${plan.checkpoint_id}
        `,
      ]
    case "lesson_questions":
      return [
        sql`
          UPDATE canonical.learning_module_checkpoints
          SET question_ids = ${JSON.stringify(plan.question_ids)}::jsonb, updated_at = now()
          WHERE id = ${plan.checkpoint_id}
        `,
      ]
    case "occurrence_topic":
      return [
        sql`UPDATE canonical.question_occurrences SET topic = ${plan.topic}, updated_at = now() WHERE id = ${plan.occurrence_id}`,
      ]
    case "occurrence_join":
      return [
        sql`
          UPDATE canonical.question_occurrences
          SET canonical_question_id = ${plan.canonical_question_id},
              join_score = ${plan.join_score}::float8,
              join_method = ${plan.join_method},
              updated_at = now()
          WHERE id = ${plan.occurrence_id}
        `,
      ]
  }
}

function closeTaskQuery(sql: Sql, proposalId: string, status: string, reviewer: string): Query {
  return sql`
    UPDATE admin.review_tasks
    SET status = ${status},
        assignee = coalesce(assignee, ${reviewer}),
        payload_json = payload_json || jsonb_build_object('decided_by', ${reviewer}::text, 'decided_at', now())
    WHERE subject_type = 'enrichment_proposal' AND subject_id = ${proposalId}
      AND status NOT IN ('done', 'closed')
  `
}

export async function decideProposal(
  decision: ProposalDecision,
  reviewer: string,
): Promise<{ item: ProposalItem; applied: boolean; message: string }> {
  const sql = adminSql()
  if (!sql) throw new ReviewStoreError(503, "database_unavailable", "No database configured")
  const row = await loadRow(sql, decision.id)
  if (!row) throw new ReviewStoreError(404, "not_found", "Proposal not found")
  if (row.status !== "pending" && decision.action !== "edit") {
    throw new ReviewStoreError(409, "already_decided", `Proposal is already ${row.status}`)
  }
  const note = decision.note ?? null

  if (decision.action === "edit") {
    if (row.status !== "pending") {
      throw new ReviewStoreError(409, "already_decided", `Proposal is already ${row.status}`)
    }
    // Validate the edit up front so reviewers see errors before approving.
    try {
      planProposalApplication(row, decision.proposal_json)
    } catch (err) {
      if (err instanceof ProposalPlanError) throw new ReviewStoreError(422, "invalid_proposal", err.message)
      throw err
    }
    await sql`
      UPDATE staging.enrichment_proposals
      SET proposal_json = ${JSON.stringify(decision.proposal_json)}::jsonb,
          review_note = coalesce(${note}::text, review_note),
          reviewer = ${reviewer}
      WHERE id = ${row.id}
    `
    const updated = (await loadRow(sql, row.id))!
    return { item: await toItem(sql, updated), applied: false, message: "Proposal edited" }
  }

  if (decision.action === "reject") {
    await sql.transaction([
      sql`
        UPDATE staging.enrichment_proposals
        SET status = 'rejected', reviewer = ${reviewer}, review_note = ${note},
            decided_at = now()
        WHERE id = ${row.id} AND status = 'pending'
      `,
      ...(row.target_kind === "rubric"
        ? [
            sql`
              UPDATE canonical.answers SET rubric_status = 'rejected', updated_at = now()
              WHERE (id = ${row.target_id} OR canonical_question_id = ${row.target_id})
                AND rubric_status = 'pending'
            `,
          ]
        : []),
      closeTaskQuery(sql, row.id, "closed", reviewer),
    ] as never)
    const updated = (await loadRow(sql, row.id))!
    return { item: await toItem(sql, updated), applied: false, message: "Proposal rejected" }
  }

  // approve
  const edited = decision.proposal_json
  let plan: ApplyPlan
  try {
    plan = planProposalApplication(row, edited)
  } catch (err) {
    if (err instanceof ProposalPlanError) throw new ReviewStoreError(422, "invalid_proposal", err.message)
    throw err
  }
  await assertTargetExists(sql, plan)
  const proposalJson = edited === undefined ? row.proposal_json : edited
  await sql.transaction([
    ...applyQueries(sql, plan),
    sql`
      UPDATE staging.enrichment_proposals
      SET status = 'applied',
          proposal_json = ${JSON.stringify(proposalJson)}::jsonb,
          reviewer = ${reviewer},
          review_note = ${note},
          decided_at = now()
      WHERE id = ${row.id} AND status = 'pending'
    `,
    closeTaskQuery(sql, row.id, "done", reviewer),
  ] as never)
  const updated = (await loadRow(sql, row.id))!
  return {
    item: await toItem(sql, updated),
    applied: true,
    message: `Approved and applied (${plan.kind.replace(/_/g, " ")})`,
  }
}
