/**
 * Enrichment proposal review — pure planning + diff (plan P2.5).
 *
 * `planProposalApplication` turns a staging.enrichment_proposals row into a
 * typed write plan; lib/admin/review-store.ts executes the plan in one
 * transaction. Keeping planning pure makes every approval rule testable
 * without a database.
 *
 * target_kind / target_id / field conventions (shared with the enrichment
 * workers that write proposals):
 *
 * | target_kind | target_id              | field                                       | proposal_json |
 * |-------------|------------------------|---------------------------------------------|---------------|
 * | rubric      | answer id or question id | rubric_json (any)                         | AnswerRubric  |
 * | question    | canonical question id  | taxonomy / topic / difficulty / domain / subtopic | object or scalar |
 * | answer      | answer id              | concise_answer / expanded_explanation / common_mistakes_json / follow_ups_json | string or string[] |
 * | diagram     | diagram id             | body / title / a11y_fallback                | string or {format, body} |
 * | lesson      | checkpoint id          | body_markdown / question_ids                | string / string[] |
 * | occurrence  | occurrence id          | topic / join                                | string / {canonical_question_id, join_score, join_method} |
 */
import {
  AnswerRubricSchema,
  parseInteractiveDiagram,
  type AnswerRubric,
} from "@ibpe/contracts"

import { TOPIC_LABELS } from "@/lib/topics"

export const PROPOSAL_TARGET_KINDS = [
  "question",
  "answer",
  "rubric",
  "diagram",
  "lesson",
  "occurrence",
] as const
export type ProposalTargetKind = (typeof PROPOSAL_TARGET_KINDS)[number]

export const PROPOSAL_STATUSES = ["pending", "approved", "rejected", "applied"] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export type ProposalRow = {
  id: string
  target_kind: ProposalTargetKind | string
  target_id: string
  field: string
  proposal_json: unknown
  current_json: unknown
  model: string | null
  prompt_version: string | null
  confidence: number | null
  status: ProposalStatus | string
  auto_approved: boolean
  reviewer: string | null
  review_note: string | null
  decided_at: string | null
  created_at: string
}

export type TaxonomyUpdate = {
  topic?: string
  subtopic?: string
  difficulty?: string
  domain?: string
  question_type?: string
}

export type ApplyPlan =
  | { kind: "rubric"; target_id: string; rubric: AnswerRubric }
  | { kind: "question_taxonomy"; question_id: string; set: TaxonomyUpdate }
  | {
      kind: "answer_text"
      answer_id: string
      column: "concise_answer" | "expanded_explanation"
      value: string
    }
  | {
      kind: "answer_list"
      answer_id: string
      column: "common_mistakes_json" | "follow_ups_json"
      value: string[]
    }
  | { kind: "diagram_body"; diagram_id: string; format: "mermaid" | "interactive-json"; body: string }
  | { kind: "diagram_meta"; diagram_id: string; column: "title" | "a11y_fallback"; value: string }
  | { kind: "lesson_body"; checkpoint_id: string; body_markdown: string }
  | { kind: "lesson_questions"; checkpoint_id: string; question_ids: string[] }
  | { kind: "occurrence_topic"; occurrence_id: string; topic: string }
  | {
      kind: "occurrence_join"
      occurrence_id: string
      canonical_question_id: string
      join_score: number | null
      join_method: "exact" | "fuzzy" | "embedding" | "manual"
    }

export class ProposalPlanError extends Error {
  readonly status = 422
  constructor(message: string) {
    super(message)
    this.name = "ProposalPlanError"
  }
}

const DOMAINS = new Set(["ib", "pe", "both", "other"])
const DIFFICULTIES = new Set(["foundational", "core", "advanced"])
const JOIN_METHODS = new Set(["exact", "fuzzy", "embedding", "manual"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, label: string, max = 20000): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProposalPlanError(`${label} must be a non-empty string`)
  }
  if (value.length > max) throw new ProposalPlanError(`${label} is longer than ${max} characters`)
  return value
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new ProposalPlanError(`${label} must be an array of non-empty strings`)
  }
  return value as string[]
}

/** Unwrap {value: x} / {<field>: x} envelopes the workers sometimes emit. */
function unwrap(proposal: unknown, field: string): unknown {
  if (isRecord(proposal)) {
    if (field in proposal && Object.keys(proposal).length === 1) return proposal[field]
    if ("value" in proposal && Object.keys(proposal).length === 1) return proposal.value
  }
  return proposal
}

function taxonomyUpdate(field: string, proposal: unknown): TaxonomyUpdate {
  const single = ["topic", "subtopic", "difficulty", "domain", "question_type"]
  const raw: Record<string, unknown> = single.includes(field)
    ? { [field]: unwrap(proposal, field) }
    : isRecord(proposal)
      ? proposal
      : {}
  const set: TaxonomyUpdate = {}
  if (raw.topic !== undefined && raw.topic !== null) {
    const topic = requireString(raw.topic, "topic", 64)
    if (!(topic in TOPIC_LABELS)) throw new ProposalPlanError(`unknown topic "${topic}"`)
    set.topic = topic
  }
  if (raw.subtopic !== undefined && raw.subtopic !== null) {
    set.subtopic = requireString(raw.subtopic, "subtopic", 120)
  }
  if (raw.difficulty !== undefined && raw.difficulty !== null) {
    const difficulty = requireString(raw.difficulty, "difficulty", 32).toLowerCase()
    if (!DIFFICULTIES.has(difficulty)) {
      throw new ProposalPlanError(`difficulty must be one of ${[...DIFFICULTIES].join(", ")}`)
    }
    set.difficulty = difficulty
  }
  if (raw.domain !== undefined && raw.domain !== null) {
    const domain = requireString(raw.domain, "domain", 16).toLowerCase()
    if (!DOMAINS.has(domain)) {
      throw new ProposalPlanError(`domain must be one of ${[...DOMAINS].join(", ")}`)
    }
    set.domain = domain
  }
  if (raw.question_type !== undefined && raw.question_type !== null) {
    set.question_type = requireString(raw.question_type, "question_type", 32)
  }
  if (Object.keys(set).length === 0) {
    throw new ProposalPlanError("taxonomy proposal has no topic, subtopic, difficulty, domain or question_type")
  }
  return set
}

/**
 * Build the write plan for approving `row`, optionally with a reviewer-edited
 * proposal. Throws ProposalPlanError (422) when the proposal is not applicable.
 */
export function planProposalApplication(row: ProposalRow, edited?: unknown): ApplyPlan {
  const proposal = edited === undefined ? row.proposal_json : edited
  const field = row.field
  switch (row.target_kind) {
    case "rubric": {
      const parsed = AnswerRubricSchema.safeParse(unwrap(proposal, field))
      if (!parsed.success) {
        throw new ProposalPlanError(
          `rubric proposal fails AnswerRubricSchema: ${parsed.error.issues
            .slice(0, 3)
            .map((issue) => `${issue.path.join(".")} ${issue.message}`)
            .join("; ")}`,
        )
      }
      return {
        kind: "rubric",
        target_id: row.target_id,
        rubric: { ...parsed.data, review_status: "approved" },
      }
    }
    case "question":
      return {
        kind: "question_taxonomy",
        question_id: row.target_id,
        set: taxonomyUpdate(field, proposal),
      }
    case "answer": {
      if (field === "concise_answer" || field === "expanded_explanation") {
        return {
          kind: "answer_text",
          answer_id: row.target_id,
          column: field,
          value: requireString(unwrap(proposal, field), field),
        }
      }
      if (field === "common_mistakes_json" || field === "follow_ups_json") {
        return {
          kind: "answer_list",
          answer_id: row.target_id,
          column: field,
          value: requireStringArray(unwrap(proposal, field), field),
        }
      }
      throw new ProposalPlanError(`answer field "${field}" is not reviewable here`)
    }
    case "diagram": {
      if (field === "body" || field === "mermaid" || field === "interactive_json") {
        const value = unwrap(proposal, field)
        const body = isRecord(value) ? value.body : value
        const format =
          isRecord(value) && value.format === "interactive-json"
            ? "interactive-json"
            : field === "interactive_json"
              ? "interactive-json"
              : "mermaid"
        const text = requireString(
          typeof body === "string" ? body : body === undefined ? undefined : JSON.stringify(body),
          "diagram body",
        )
        if (format === "interactive-json" && !parseInteractiveDiagram(text)) {
          throw new ProposalPlanError("interactive-json body fails InteractiveDiagramSchema")
        }
        if (format === "mermaid" && !/^\s*(flowchart|graph|sequenceDiagram|stateDiagram|classDiagram|xychart-beta|pie)\b/.test(text)) {
          throw new ProposalPlanError("mermaid body must start with a diagram type (e.g. flowchart LR)")
        }
        return { kind: "diagram_body", diagram_id: row.target_id, format, body: text }
      }
      if (field === "title" || field === "a11y_fallback") {
        return {
          kind: "diagram_meta",
          diagram_id: row.target_id,
          column: field,
          value: requireString(unwrap(proposal, field), field, 4000),
        }
      }
      throw new ProposalPlanError(`diagram field "${field}" is not reviewable here`)
    }
    case "lesson": {
      if (field === "body_markdown") {
        const body = requireString(unwrap(proposal, field), "body_markdown", 40000)
        if (/<\s*script/i.test(body)) throw new ProposalPlanError("lesson markdown must not contain HTML script tags")
        return { kind: "lesson_body", checkpoint_id: row.target_id, body_markdown: body }
      }
      if (field === "question_ids") {
        const ids = requireStringArray(unwrap(proposal, field), "question_ids")
        return { kind: "lesson_questions", checkpoint_id: row.target_id, question_ids: [...new Set(ids)] }
      }
      throw new ProposalPlanError(`lesson field "${field}" is not reviewable here`)
    }
    case "occurrence": {
      if (field === "topic") {
        const topic = requireString(unwrap(proposal, field), "topic", 64)
        if (!(topic in TOPIC_LABELS)) throw new ProposalPlanError(`unknown topic "${topic}"`)
        return { kind: "occurrence_topic", occurrence_id: row.target_id, topic }
      }
      if (field === "join" || field === "canonical_question_id") {
        const value = unwrap(proposal, field)
        const record = isRecord(value) ? value : { canonical_question_id: value }
        const questionId = requireString(record.canonical_question_id, "canonical_question_id", 64)
        const score = record.join_score
        if (score !== undefined && score !== null && (typeof score !== "number" || score < 0 || score > 1)) {
          throw new ProposalPlanError("join_score must be between 0 and 1")
        }
        const method = typeof record.join_method === "string" ? record.join_method : "manual"
        if (!JOIN_METHODS.has(method)) throw new ProposalPlanError(`unknown join_method "${method}"`)
        return {
          kind: "occurrence_join",
          occurrence_id: row.target_id,
          canonical_question_id: questionId,
          join_score: typeof score === "number" ? score : null,
          join_method: method as "exact" | "fuzzy" | "embedding" | "manual",
        }
      }
      throw new ProposalPlanError(`occurrence field "${field}" is not reviewable here`)
    }
    default:
      throw new ProposalPlanError(`unknown target_kind "${row.target_kind}"`)
  }
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export type DiffEntry = {
  path: string
  change: "added" | "removed" | "changed"
  before?: unknown
  after?: unknown
}

function flatten(value: unknown, prefix: string, out: Map<string, unknown>) {
  if (isRecord(value)) {
    const keys = Object.keys(value)
    if (keys.length === 0) out.set(prefix || "(root)", {})
    for (const key of keys) flatten(value[key], prefix ? `${prefix}.${key}` : key, out)
    return
  }
  if (Array.isArray(value) && value.some((item) => isRecord(item) || Array.isArray(item))) {
    if (value.length === 0) out.set(prefix || "(root)", [])
    value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, out))
    return
  }
  out.set(prefix || "(root)", value)
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Path-level diff of current vs proposed JSON (scalars and flat arrays are leaves). */
export function diffJson(current: unknown, proposed: unknown): DiffEntry[] {
  const before = new Map<string, unknown>()
  const after = new Map<string, unknown>()
  if (current !== null && current !== undefined) flatten(current, "", before)
  flatten(proposed, "", after)
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort()
  const entries: DiffEntry[] = []
  for (const path of paths) {
    const hasBefore = before.has(path)
    const hasAfter = after.has(path)
    if (hasBefore && !hasAfter) entries.push({ path, change: "removed", before: before.get(path) })
    else if (!hasBefore && hasAfter) entries.push({ path, change: "added", after: after.get(path) })
    else if (!same(before.get(path), after.get(path))) {
      entries.push({ path, change: "changed", before: before.get(path), after: after.get(path) })
    }
  }
  return entries
}

export type LineDiff = Array<{ op: "same" | "add" | "del"; text: string }>

/** Line diff (LCS) for long text such as lesson markdown or mermaid bodies. */
export function diffLines(before: string, after: string, maxLines = 400): LineDiff {
  const a = before.split("\n").slice(0, maxLines)
  const b = after.split("\n").slice(0, maxLines)
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const out: LineDiff = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: "same", text: a[i]! })
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ op: "del", text: a[i]! })
      i++
    } else {
      out.push({ op: "add", text: b[j]! })
      j++
    }
  }
  while (i < a.length) out.push({ op: "del", text: a[i++]! })
  while (j < b.length) out.push({ op: "add", text: b[j++]! })
  return out
}
