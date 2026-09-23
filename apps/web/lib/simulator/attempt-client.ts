/**
 * Browser helpers for posting practice attempts and reading the grade back
 * (plan 2026-09-23-001 P0.2 / P3.3 / P3.4). Shared by the study page and the
 * simulator. Pure apart from `postAttempt` (fetch).
 */
import type { ActivityResult, DeliveryScore } from "@ibpe/contracts"
import type { AttemptGradeResponse } from "@/lib/api/schemas"

export type AttemptPostBody = {
  canonical_question_id: string
  response_text: string
  confidence?: number | null
  correct?: boolean | null
  time_spent_ms?: number | null
  rating?: "again" | "hard" | "good" | "easy"
  /** ISO time the gold answer was revealed for this question (anti-gaming, P3.4). */
  revealed_at?: string
  /** Client-computed voice delivery (P7.1); the backend may ignore it. */
  delivery?: DeliveryScore | null
}

export type AttemptPostResult =
  | {
      ok: true
      grade: AttemptGradeResponse | null
      activity: ActivityResult | null
      review: { due_at: string } | null
    }
  | { ok: false; status: number }

/** Prefix a follow-up answer with the interviewer's follow-up for grading context. */
export function followUpResponseText(followUp: string, answer: string): string {
  return `[Interviewer follow-up: ${followUp.trim()}]\n${answer.trim()}`
}

/** Merge the client delivery score into a grade when the backend did not echo one. */
export function withDelivery(
  grade: AttemptGradeResponse,
  delivery: DeliveryScore | null | undefined,
): AttemptGradeResponse {
  if (grade.delivery || !delivery) return grade
  return { ...grade, delivery }
}

export function buildAttemptBody(input: AttemptPostBody): AttemptPostBody {
  const body: AttemptPostBody = { ...input }
  if (!body.revealed_at) delete body.revealed_at
  if (!body.delivery) delete body.delivery
  if (!body.rating) delete body.rating
  return body
}

/** Parse the attempts API JSON defensively — render whatever grade fields exist. */
export function parseAttemptResponse(raw: unknown): Extract<AttemptPostResult, { ok: true }> {
  const payload = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const grade = payload.grade as AttemptGradeResponse | undefined
  const validGrade =
    grade && typeof grade === "object" && typeof grade.score === "number" && grade.score_source
      ? {
          ...grade,
          weak_topics: Array.isArray(grade.weak_topics) ? grade.weak_topics : [],
          citations: Array.isArray(grade.citations) ? grade.citations : [],
        }
      : null
  const review = payload.review as { due_at?: unknown } | undefined
  return {
    ok: true,
    grade: validGrade,
    activity: (payload.activity as ActivityResult | null | undefined) ?? null,
    review: review && typeof review.due_at === "string" ? { due_at: review.due_at } : null,
  }
}

export async function postAttempt(
  sessionId: string,
  body: AttemptPostBody,
): Promise<AttemptPostResult> {
  const response = await fetch(`/api/practice/sessions/${encodeURIComponent(sessionId)}/attempts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildAttemptBody(body)),
  })
  if (!response.ok) return { ok: false, status: response.status }
  return parseAttemptResponse(await response.json().catch(() => ({})))
}

/** Short status line announcing a grade (aria-live). */
export function gradeStatus(grade: AttemptGradeResponse): string {
  const percent = Math.round(grade.score * 100)
  switch (grade.score_source) {
    case "llm":
      return `AI-graded ${percent}%`
    case "jev":
      return `Graded by Jev ${percent}%`
    case "numeric":
      return `Numeric check ${percent}%`
    case "deterministic":
      return `Estimated ${percent}%`
    case "reveal_copy":
      return "Copied after reveal — not counted"
    default:
      return `Self-rated ${percent}%`
  }
}
