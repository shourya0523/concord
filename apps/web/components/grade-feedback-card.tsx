"use client"

/**
 * Grade feedback after an attempt (plan 2026-09-23-001 P0.2 / P3.3).
 * Shared by the study page, simulator and the daily-set player. Shows what the
 * grader actually decided: score, source, rubric items with evidence, numeric
 * checks, the interviewer follow-up and citations.
 */
import type { AttemptGradeResponse } from "@/lib/api/schemas"
import { SemanticPill } from "@/components/paper"
import { cn } from "@ibpe/ui/lib/utils"

const SOURCE_LABEL: Record<AttemptGradeResponse["score_source"], string> = {
  llm: "AI-graded against the teaching answer",
  numeric: "Checked numerically",
  deterministic: "Estimated (keyword coverage)",
  self: "Self-rated",
  reveal_copy: "Copied after reveal — not counted",
}

const VERDICT_TONE = {
  hit: "success",
  partial: "streak",
  miss: "error",
} as const

export function GradeFeedbackCard({
  grade,
  className,
  onFollowUp,
}: {
  grade: AttemptGradeResponse
  className?: string
  /** When set, shows a "try the follow-up" action. */
  onFollowUp?: (followUp: string) => void
}) {
  const percent = Math.round(grade.score * 100)
  const tone =
    grade.score_source === "reveal_copy"
      ? "neutral"
      : grade.score >= 0.7
        ? "success"
        : grade.score >= 0.45
          ? "streak"
          : "error"
  const items = grade.rubric_items ?? []
  const numeric = grade.numeric_checks ?? []
  const redFlags = grade.red_flags_triggered ?? []

  return (
    <section
      aria-label="Grade feedback"
      className={cn("space-y-3 rounded-md border border-border bg-card p-4", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SemanticPill tone={tone}>{percent}%</SemanticPill>
        <span className="text-sm text-muted-foreground">
          {SOURCE_LABEL[grade.score_source]}
          {grade.cached ? " · cached" : ""}
        </span>
      </div>

      {grade.feedback ? <p className="text-sm leading-relaxed">{grade.feedback}</p> : null}

      {items.length > 0 ? (
        <ul className="space-y-2" aria-label="Key points">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <div className="flex items-start gap-2">
                <SemanticPill tone={VERDICT_TONE[item.verdict]}>{item.verdict}</SemanticPill>
                <span>
                  {item.text}
                  {item.must_have ? (
                    <span className="ml-1 text-xs text-muted-foreground">(must-have)</span>
                  ) : null}
                </span>
              </div>
              {item.evidence ? (
                <blockquote className="ml-2 mt-1 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
                  “{item.evidence}”
                </blockquote>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {numeric.length > 0 ? (
        <ul className="space-y-1" aria-label="Numeric checks">
          {numeric.map((check) => (
            <li key={check.id} className="flex items-center gap-2 text-sm">
              <SemanticPill tone={check.pass ? "success" : "error"}>
                {check.pass ? "correct" : "off"}
              </SemanticPill>
              <span>
                {check.label}: expected {formatNumber(check.expected)}
                {check.unit ?? ""}
                {check.found == null
                  ? " — no number found"
                  : `, you said ${formatNumber(check.found)}${check.unit ?? ""}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {redFlags.length > 0 ? (
        <div className="text-sm">
          <SemanticPill tone="weak">Red flag</SemanticPill>{" "}
          <span>{redFlags.join(" · ")}</span>
        </div>
      ) : null}

      {grade.weak_topics.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Weak topics: {grade.weak_topics.join(", ")}
        </p>
      ) : null}

      {grade.follow_up ? (
        <div className="rounded-md bg-secondary p-3 text-sm">
          <p className="font-medium">The interviewer follows up:</p>
          <p className="mt-1">{grade.follow_up}</p>
          {onFollowUp ? (
            <button
              type="button"
              className="mt-2 text-sm underline underline-offset-4"
              onClick={() => onFollowUp(grade.follow_up as string)}
            >
              Answer the follow-up
            </button>
          ) : null}
        </div>
      ) : null}

      {grade.citations.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Sources: {grade.citations.map((c) => c.label ?? c.id).join(" · ")}
        </p>
      ) : null}
    </section>
  )
}

function formatNumber(value: number): string {
  return Math.abs(value) >= 100 ? value.toFixed(0) : String(Math.round(value * 100) / 100)
}
