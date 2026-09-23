"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

import type { ActivityResult, DeliveryScore } from "@ibpe/contracts"

import { DiagramIsland } from "@/components/diagram-island"
import { ActivityPills, GradeFeedbackCard } from "@/components/grade-feedback-card"
import { VoiceAnswer } from "@/components/voice-answer"
import {
  Annotate,
  CircledNumber,
  HandwritingHeadline,
  InkHoverScope,
  InterviewerAvatar,
  PaperBurst,
  PaperSheet,
  RoughHover,
  SemanticPill,
  Warren,
  WarrenCallout,
  type InterviewerId,
  type InterviewerState,
} from "@/components/paper"
import {
  fetchFirmOptions,
  readStoredTargets,
} from "@/components/target-select-island"
import type { AttemptGradeResponse } from "@/lib/api/schemas"
import type { MockReportResponse } from "@/lib/api/grading-ui-schemas"
import {
  followUpResponseText,
  gradeStatus,
  postAttempt,
  withDelivery,
} from "@/lib/simulator/attempt-client"
import {
  STAGE_CONCEPT,
  selectStageQuestions,
  type StageSelection,
} from "@/lib/simulator/select"
import { topicLabel } from "@/lib/topics"

/**
 * Interview simulator (DESIGN.md §10.11) — firm-templated mock.
 * Self-ratings map Again/Hard/Good/Easy → confidence 0.25/0.5/0.75/1; the
 * attempt POST is the confirmed result, so the score reveal (and Warren's
 * celebration) only render after the last attempt save succeeds.
 *
 * Plan 2026-09-23-001 P5.8: each stage's question is picked by stage topic
 * (STAGE_CONCEPT) from the frozen firm pack, every answer shows its grade,
 * and the reveal renders the cited after-action report.
 */

type StageTemplate = { id: string; label: string; minutes: number }

const STAGE_TEMPLATES: Record<"ib" | "pe", StageTemplate[]> = {
  ib: [
    { id: "ib_fit", label: "Fit / motivation", minutes: 8 },
    { id: "ib_accounting", label: "Accounting technicals", minutes: 12 },
    { id: "ib_valuation", label: "Valuation & DCF", minutes: 15 },
    { id: "ib_deal_judgement", label: "Market / deal judgement", minutes: 10 },
  ],
  pe: [
    { id: "pe_fit", label: "Investing fit", minutes: 8 },
    { id: "pe_lbo", label: "LBO & returns", minutes: 15 },
    { id: "pe_ic", label: "IC judgement", minutes: 12 },
    { id: "pe_portfolio", label: "Portfolio operations", minutes: 10 },
  ],
}

const STAGE_DIAGRAM_PROMPT: Record<
  string,
  { title: string; prompt: string; source: string; a11y: string }
> = {
  ib_accounting: {
    title: "Three-statement sketch",
    prompt:
      "Sketch how depreciation flows through income statement, cash flow, and balance sheet.",
    source: `flowchart LR
  Revenue --> EBITDA
  EBITDA --> EBIT
  Depreciation -. added back .-> CFO
  CFO --> Cash
  Depreciation -. lowers .-> PP&E
  Cash --> BalanceSheet[Balance sheet balances]`,
    a11y: "Depreciation reduces EBIT, is added back in operating cash flow, lowers PP&E, and the cash impact rolls into the balance sheet.",
  },
  ib_valuation: {
    title: "DCF bridge sketch",
    prompt:
      "Sketch unlevered free cash flow through terminal value, discounting, and equity bridge.",
    source: `flowchart LR
  UFCF[Unlevered FCF] --> Discount[Discount at WACC]
  Terminal[Terminal value] --> Discount
  Discount --> EV[Enterprise value]
  EV --> NetDebt[Less net debt]
  NetDebt --> Equity[Equity value]`,
    a11y: "Unlevered free cash flow and terminal value are discounted at WACC to enterprise value, then bridged through net debt to equity value.",
  },
  pe_lbo: {
    title: "Sources & uses sketch",
    prompt:
      "Sketch sources & uses before speaking to returns, debt paydown, and exit multiple.",
    source: `flowchart LR
  Equity[Equity sponsor] --> Sources
  Debt[Debt financing] --> Sources
  Sources --> Purchase[Purchase equity]
  Sources --> Fees[Fees and expenses]
  EBITDA[Entry EBITDA] --> Exit[Exit EBITDA x multiple]
  Exit --> DebtPaydown[Less remaining debt]
  DebtPaydown --> MOIC[Equity MOIC / IRR]`,
    a11y: "Sponsor equity and debt fund purchase price plus fees; exit value less remaining debt produces sponsor proceeds and MOIC or IRR.",
  },
}

const RATINGS = [
  { label: "Again", confidence: 0.25 },
  { label: "Hard", confidence: 0.5 },
  { label: "Good", confidence: 0.75 },
  { label: "Easy", confidence: 1 },
] as const

const PASS_CONFIDENCE = 0.75

type FirmOption = { id: string; name: string; track?: string }

type SessionPayload = {
  session: { id: string; question_ids: string[] }
  source: string
  note?: string
}

type QuestionPayload = {
  question: { id: string; canonical_wording: string; topic?: string | null }
}

type StageResult = {
  stage: StageTemplate
  confidence: number
  correct: boolean
  questionId: string
  questionTopic: string | null
  grade: AttemptGradeResponse | null
  followUpGrade: AttemptGradeResponse | null
}

type MockReport = MockReportResponse["report"]

type Phase = "setup" | "starting" | "running" | "reveal"

/** Deterministic fixed-cast mapping (DESIGN.md §6 — same firm, same face). */
function interviewerForFirm(firmName: string): InterviewerId {
  const name = firmName.toLowerCase()
  if (/(blackstone|carlyle)/.test(name)) return "taylor-associate-blackstone"
  if (/(evercore|lazard|centerview|pjt|moelis)/.test(name))
    return "casey-md-evercore"
  if (
    /(kkr|apollo|tpg|advent|permira|cvc|bain capital|eqt|vista|thoma bravo|silver lake|warburg)/.test(
      name
    )
  ) {
    return "alex-pe-kkr"
  }
  if (/(jpmorgan|jp morgan|j\.p\. morgan|jpm)/.test(name)) {
    return "jordan-analyst-jpm"
  }
  return "morgan-vp-gs"
}

function trackKeyForFirm(firm: FirmOption | undefined): "ib" | "pe" {
  return firm?.track?.toLowerCase().includes("pe") ? "pe" : "ib"
}

function mmss(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function stageClock(
  elapsedMs: number,
  stageMinutes: number
): { label: string; overtime: boolean } {
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const limitSeconds = stageMinutes * 60
  const remaining = limitSeconds - elapsedSeconds
  if (remaining >= 0) return { label: mmss(remaining), overtime: false }
  return { label: `+${mmss(Math.abs(remaining))}`, overtime: true }
}

/** Stage score: the grade when present, else the self-rating. */
function stageScore(result: StageResult): number {
  if (result.grade) return result.grade.score_source === "reveal_copy" ? 0 : result.grade.score
  return result.confidence
}

function scoreTone(score: number | null) {
  if (score == null) return "neutral" as const
  if (score >= 0.7) return "success" as const
  if (score >= 0.45) return "streak" as const
  return "error" as const
}

export function SimulatorIsland({ voiceEnabled = false }: { voiceEnabled?: boolean } = {}) {
  const [phase, setPhase] = React.useState<Phase>("setup")
  const [firms, setFirms] = React.useState<FirmOption[]>([])
  const [firmId, setFirmId] = React.useState<string>("")
  const [role, setRole] = React.useState<"Analyst" | "Associate">("Analyst")
  const [session, setSession] = React.useState<
    SessionPayload["session"] | null
  >(null)
  const [stageIndex, setStageIndex] = React.useState(0)
  const [question, setQuestion] = React.useState<
    QuestionPayload["question"] | null
  >(null)
  const [questionLoading, setQuestionLoading] = React.useState(false)
  const [answer, setAnswer] = React.useState("")
  const [typing, setTyping] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [results, setResults] = React.useState<StageResult[]>([])
  const [stagePlan, setStagePlan] = React.useState<StageSelection[]>([])
  const [stageGrade, setStageGrade] = React.useState<AttemptGradeResponse | null>(null)
  const [stageActivity, setStageActivity] = React.useState<ActivityResult | null>(null)
  const [delivery, setDelivery] = React.useState<DeliveryScore | null>(null)
  const [report, setReport] = React.useState<MockReport | null>(null)
  const [reportActivity, setReportActivity] = React.useState<ActivityResult | null>(null)
  const [reportState, setReportState] = React.useState<"idle" | "loading" | "ready" | "failed">(
    "idle"
  )
  const [liveStatus, setLiveStatus] = React.useState("")
  const questionCache = React.useRef(new Map<string, QuestionPayload["question"]>())
  const [error, setError] = React.useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = React.useState(0)
  const elapsedMsRef = React.useRef(0)
  const startedAt = React.useRef(0)

  React.useEffect(() => {
    let cancelled = false
    void fetchFirmOptions().then((options) => {
      if (cancelled) return
      setFirms(options)
      const stored = readStoredTargets()
      const first = stored[0]
      if (first && options.some((firm) => firm.id === first)) {
        setFirmId(first)
      } else if (options[0]) {
        setFirmId(options[0].id)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const firm = firms.find((option) => option.id === firmId)
  const trackKey = trackKeyForFirm(firm)
  const stages = STAGE_TEMPLATES[trackKey]
  const interviewerId = interviewerForFirm(firm?.name ?? "")

  const fetchQuestion = React.useCallback(
    async (questionId: string): Promise<QuestionPayload["question"] | null> => {
      const cached = questionCache.current.get(questionId)
      if (cached) return cached
      const response = await fetch(
        `/api/questions/${encodeURIComponent(questionId)}?view=study`
      )
      if (!response.ok) return null
      const payload = (await response.json()) as QuestionPayload
      questionCache.current.set(questionId, payload.question)
      return payload.question
    },
    []
  )

  /** Prefetch pack questions (for their topics) and pick one per stage by topic. */
  const planStages = React.useCallback(
    async (
      sessionData: SessionPayload["session"],
      stageList: StageTemplate[]
    ): Promise<StageSelection[]> => {
      const candidates = await Promise.all(
        sessionData.question_ids.map(async (id) => {
          try {
            const loaded = await fetchQuestion(id)
            return { id, topic: loaded?.topic ?? null }
          } catch {
            return { id, topic: null }
          }
        })
      )
      return selectStageQuestions(stageList, candidates)
    },
    [fetchQuestion]
  )

  const loadStageQuestion = React.useCallback(
    async (plan: StageSelection[], index: number) => {
      const questionId = plan[index]?.questionId
      if (!questionId) {
        setError("The session ran out of questions for this stage.")
        return
      }
      setQuestionLoading(true)
      setError(null)
      setStageGrade(null)
      setStageActivity(null)
      setDelivery(null)
      try {
        const loaded = await fetchQuestion(questionId)
        if (!loaded) {
          setError("The stage question didn't load.")
          return
        }
        setQuestion(loaded)
        setAnswer("")
        startedAt.current = Date.now()
        elapsedMsRef.current = 0
        setElapsedMs(0)
      } catch {
        setError("The stage question didn't load — the network request failed.")
      } finally {
        setQuestionLoading(false)
      }
    },
    [fetchQuestion]
  )

  async function start() {
    if (!firmId || phase === "starting") return
    setPhase("starting")
    setError(null)
    setResults([])
    setStageIndex(0)
    setReport(null)
    setReportActivity(null)
    setReportState("idle")
    questionCache.current.clear()
    try {
      const response = await fetch("/api/practice/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "simulator",
          learning_mode: "company_prep",
          firm_ids: [firmId],
          concept_ids: [],
          question_ids: [],
          limit: stages.length,
        }),
      })
      if (response.status === 401) {
        setError("Sign in to run a firm mock — sessions save to your account.")
        setPhase("setup")
        return
      }
      if (!response.ok) {
        setError(
          `The simulator session failed to start (HTTP ${response.status}).`
        )
        setPhase("setup")
        return
      }
      const payload = (await response.json()) as SessionPayload
      if (payload.session.question_ids.length === 0) {
        setError("No published questions are available for a mock right now.")
        setPhase("setup")
        return
      }
      setSession(payload.session)
      const plan = await planStages(payload.session, stages)
      setStagePlan(plan)
      setPhase("running")
      await loadStageQuestion(plan, 0)
    } catch {
      setError(
        "The simulator session failed to start — the network request failed."
      )
      setPhase("setup")
    }
  }

  async function submitRating(confidence: number) {
    if (!session || !question || submitting || stageGrade) return
    const stage = stages[stageIndex]
    if (!stage) return
    setSubmitting(true)
    setError(null)
    const correct = confidence >= PASS_CONFIDENCE
    const timeSpentMs = Math.max(
      0,
      Math.round(elapsedMsRef.current || elapsedMs)
    )
    try {
      const result = await postAttempt(session.id, {
        canonical_question_id: question.id,
        response_text: answer,
        confidence,
        // A written answer is graded; a blank one keeps the self-rating.
        correct: answer.trim() ? null : correct,
        time_spent_ms: timeSpentMs,
        delivery,
      })
      if (!result.ok) {
        setError(
          `The rating didn't save (HTTP ${result.status}). Your answer is still here — try again.`
        )
        return
      }
      const grade = result.grade ? withDelivery(result.grade, delivery) : null
      const nextResults = [
        ...results,
        {
          stage,
          confidence,
          correct,
          questionId: question.id,
          questionTopic: question.topic ?? null,
          grade,
          followUpGrade: null,
        },
      ]
      setResults(nextResults)
      if (grade) {
        // Show this stage's grade; the learner advances when ready.
        setStageGrade(grade)
        setStageActivity(result.activity)
        setLiveStatus(`${stage.label}: ${gradeStatus(grade)}.`)
        return
      }
      await advance(nextResults)
    } catch {
      setError(
        "The rating didn't save — the network request failed. Your answer is still here."
      )
    } finally {
      setSubmitting(false)
    }
  }

  /** Optional second try on the interviewer follow-up — same question, same rubric. */
  async function submitFollowUp(
    followUpAnswer: string,
    followUp: string
  ): Promise<AttemptGradeResponse | null> {
    if (!session || !question) return null
    const questionId = question.id
    const result = await postAttempt(session.id, {
      canonical_question_id: questionId,
      response_text: followUpResponseText(followUp, followUpAnswer),
      correct: null,
      time_spent_ms: Math.max(0, Math.round(elapsedMsRef.current || elapsedMs)),
    }).catch(() => null)
    if (!result?.ok || !result.grade) return null
    const followUpGrade = result.grade
    setResults((current) =>
      current.map((item) =>
        item.questionId === questionId ? { ...item, followUpGrade } : item
      )
    )
    setLiveStatus(`Follow-up: ${gradeStatus(followUpGrade)}.`)
    return followUpGrade
  }

  async function advance(currentResults: StageResult[] = results) {
    if (!session) return
    if (stageIndex + 1 >= stages.length) {
      // Confirmed final attempt — only now may the score reveal render.
      setPhase("reveal")
      void loadReport(session.id, currentResults)
      return
    }
    const nextIndex = stageIndex + 1
    setStageIndex(nextIndex)
    await loadStageQuestion(stagePlan, nextIndex)
  }

  async function loadReport(sessionId: string, finalResults: StageResult[]) {
    setReportState("loading")
    try {
      const response = await fetch(
        `/api/practice/sessions/${encodeURIComponent(sessionId)}/report`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            firm_name: firm?.name ?? null,
            complete: true,
            stages: finalResults.map((result) => ({
              stage_id: result.stage.id,
              label: result.stage.label,
              question_id: result.questionId,
              topic: result.questionTopic,
              grades: [result.grade, result.followUpGrade].filter(Boolean),
            })),
          }),
        }
      )
      if (!response.ok) {
        setReportState("failed")
        return
      }
      const payload = (await response.json()) as MockReportResponse
      setReport(payload.report)
      setReportActivity(payload.activity ?? null)
      setReportState("ready")
    } catch {
      setReportState("failed")
    }
  }

  function resetToSetup() {
    setPhase("setup")
    setSession(null)
    setQuestion(null)
    setStageIndex(0)
    setResults([])
    setStagePlan([])
    setStageGrade(null)
    setStageActivity(null)
    setDelivery(null)
    setReport(null)
    setReportActivity(null)
    setReportState("idle")
    setAnswer("")
    setError(null)
    elapsedMsRef.current = 0
    setElapsedMs(0)
  }

  const interviewerState: InterviewerState = submitting
    ? "evaluating"
    : questionLoading
      ? "evaluating"
      : typing
        ? "listening"
        : "speaking"

  const stage = stages[stageIndex]
  const diagramPrompt = stage ? STAGE_DIAGRAM_PROMPT[stage.id] : undefined
  const timer = stage ? stageClock(elapsedMs, stage.minutes) : null

  React.useEffect(() => {
    if (
      phase !== "running" ||
      questionLoading ||
      !stage ||
      startedAt.current === 0
    )
      return
    const tick = () => {
      const nextElapsedMs = Date.now() - startedAt.current
      elapsedMsRef.current = nextElapsedMs
      setElapsedMs(nextElapsedMs)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [phase, questionLoading, stage, stageIndex])

  if (phase === "reveal") {
    const graded = results.filter((result) => result.grade)
    const allSelfRated = graded.length === 0
    const localOverall =
      results.length > 0
        ? results.reduce((sum, result) => sum + stageScore(result), 0) /
          results.length
        : 0
    const overallScore = report?.overall_score ?? localOverall
    const overall = Math.round(overallScore * 100)
    const passed = results.filter((result) => stageScore(result) >= 0.7).length
    const weakStages = results.filter((result) => stageScore(result) < 0.7)
    const fallbackConcepts = [
      ...new Map(
        weakStages.flatMap((result) => {
          const concept = STAGE_CONCEPT[result.stage.id]
          return concept
            ? [
                [
                  concept.slug,
                  {
                    slug: concept.slug,
                    title: concept.title,
                    reason: `for your weaker ${result.stage.label.toLowerCase()} stage`,
                  },
                ] as const,
              ]
            : []
        })
      ).values(),
    ]
    const concepts =
      report?.recommended_concepts.map((concept) => ({
        slug: concept.slug,
        title: concept.title,
        reason: concept.reason,
      })) ?? fallbackConcepts
    const reportStageById = new Map(
      (report?.stages ?? []).map((stage) => [stage.stage_id, stage])
    )
    return (
      <div className="space-y-6">
        <PaperSheet seedKey={`sim-reveal-${session?.id ?? "done"}`} hero>
          <div className="relative overflow-hidden">
            <PaperBurst
              play
              seedKey={`sim-reveal-burst-${session?.id ?? "done"}`}
              className="pointer-events-none absolute top-0 right-0 opacity-80"
            />
            <HandwritingHeadline
              phrase={
                overall >= 75 ? "Mock debrief ready" : "Reset the weak reps"
              }
              play
              className="mb-5"
            />
            <div className="flex flex-wrap items-start gap-6">
              <CircledNumber
                value={`${overall}%`}
                label={allSelfRated ? "self-rated readiness" : "graded readiness"}
                size="lg"
              />
              <div className="min-w-0 flex-1 space-y-3">
                <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  {firm?.name ?? "Firm"} mock · {role} ·{" "}
                  {trackKey.toUpperCase()} template
                </p>
                <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                  {passed} of {results.length} stages at 70% or better.{" "}
                  {allSelfRated
                    ? "These are your confirmed self-ratings — Concord does not fabricate an AI score."
                    : "Written answers were graded against the teaching answer for each stage; blank answers keep your self-rating."}
                </p>
                <ul className="space-y-1.5" aria-label="Per-stage scores">
                  {results.map((result) => {
                    const score = stageScore(result)
                    const reportStage = reportStageById.get(result.stage.id)
                    return (
                      <li
                        key={result.stage.id}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                          {score >= 0.7 ? (
                            <>
                              {result.stage.label} · {result.stage.minutes}m
                            </>
                          ) : (
                            <Annotate
                              type="box"
                              color="var(--error-foreground)"
                              padding={2}
                            >
                              {result.stage.label} · {result.stage.minutes}m
                            </Annotate>
                          )}
                        </span>
                        <SemanticPill tone={scoreTone(score)}>
                          {Math.round(score * 100)}%
                        </SemanticPill>
                        <span className="text-xs text-muted-foreground">
                          {result.grade
                            ? gradeStatus(result.grade).replace(/ \d+%$/, "")
                            : "self-rated"}
                          {result.questionTopic
                            ? ` · ${topicLabel(result.questionTopic)}`
                            : ""}
                          {result.followUpGrade
                            ? ` · follow-up ${Math.round(result.followUpGrade.score * 100)}%`
                            : ""}
                        </span>
                        {reportStage?.feedback || result.grade?.feedback ? (
                          <span className="w-full pl-1 text-xs leading-relaxed text-muted-foreground">
                            {reportStage?.feedback ?? result.grade?.feedback}
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
                {reportActivity ? (
                  <ActivityPills
                    activity={reportActivity}
                    seedKey={`sim-activity-${session?.id ?? "done"}`}
                  />
                ) : null}
              </div>
              <Warren mood="celebrating" size={64} />
            </div>
          </div>
        </PaperSheet>

        <section
          className="space-y-3 border border-border bg-background/30 px-4 py-4"
          aria-labelledby="sim-report-heading"
          aria-busy={reportState === "loading"}
        >
          <h2
            id="sim-report-heading"
            className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase"
          >
            After-action report
          </h2>
          <div aria-live="polite" className="space-y-3">
            {reportState === "loading" ? (
              <p className="text-sm text-muted-foreground">
                Your interviewer is writing up the debrief…
              </p>
            ) : null}
            {reportState === "failed" ? (
              <p className="text-sm text-muted-foreground">
                The written debrief is unavailable right now — your per-stage
                scores above are saved.
              </p>
            ) : null}
            {report ? (
              <>
                <p className="max-w-2xl text-sm leading-relaxed">{report.summary}</p>
                <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  {report.summary_source === "llm"
                    ? "AI coaching · every sentence cited"
                    : "Deterministic summary"}
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  {report.strongest_topics.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Strongest</span>
                      {report.strongest_topics.map((topic) => (
                        <SemanticPill key={topic.topic} tone="success">
                          {topic.label} {Math.round(topic.score * 100)}%
                        </SemanticPill>
                      ))}
                    </div>
                  ) : null}
                  {report.weakest_topics.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Weakest</span>
                      {report.weakest_topics.map((topic) => (
                        <SemanticPill key={topic.topic} tone="weak">
                          {topic.label} {Math.round(topic.score * 100)}%
                        </SemanticPill>
                      ))}
                    </div>
                  ) : null}
                </div>
                {report.citations.length > 0 ? (
                  <ul
                    className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
                    aria-label="Report citations"
                  >
                    {report.citations.map((citation) => (
                      <li key={citation.id} className="font-mono">
                        [{citation.id}]{" "}
                        <span className="font-sans">
                          {citation.kind === "heat_topic"
                            ? `firm heat · ${citation.label ?? "topic"}`
                            : "teaching answer"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </div>
        </section>

        <section className="border border-border bg-background/30 px-4 py-4">
          <section className="space-y-4">
            <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Recommended next
            </h2>
            <WarrenCallout
              mood={weakStages.length > 0 ? "concerned" : "encouraging"}
              bracket
            >
              {weakStages.length > 0 ? (
                <span>
                  Your weak stages were{" "}
                  <strong>
                    {weakStages.map((result) => result.stage.label).join(", ")}
                  </strong>
                  . Re-run those labels first, then use the linked concept labs
                  for the mechanics.
                </span>
              ) : (
                <span>
                  Every stage cleared 70%. Keep the same cadence with one fresh
                  module checkpoint or a company prep pack.
                </span>
              )}
            </WarrenCallout>
            {concepts.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {concepts.map((concept) => (
                  <li key={concept.slug}>
                    <Link
                      href={`/concepts/${concept.slug}`}
                      className="text-foreground underline-offset-4 hover:underline"
                    >
                      {concept.title} lab →
                    </Link>{" "}
                    <span className="text-muted-foreground">{concept.reason}</span>
                  </li>
                ))}
                <li>
                  <Link
                    href="/learn"
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    Learn modules →
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    prereq-ordered lessons and drills
                  </span>
                </li>
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Every stage landed 70% or better — keep cadence with a{" "}
                <Link
                  href="/learn"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Learn module
                </Link>{" "}
                or a fresh{" "}
                <Link
                  href="/prep/rag"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  session pack
                </Link>
                .
              </p>
            )}
            <div className="pt-2">
              <RoughHover>
                <Button variant="outline" onClick={resetToSetup}>
                  Run another mock
                </Button>
              </RoughHover>
            </div>
          </section>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Setup
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Firm</span>
            <select
              value={firmId}
              onChange={(event) => setFirmId(event.target.value)}
              disabled={phase !== "setup"}
              className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground disabled:opacity-60"
            >
              {firms.length === 0 ? (
                <option value="">Loading firm catalog…</option>
              ) : null}
              {firms.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Role</span>
            <div className="flex gap-2" role="group" aria-label="Role">
              {(["Analyst", "Associate"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={role === value}
                  disabled={phase !== "setup"}
                  onClick={() => setRole(value)}
                  className={
                    role === value
                      ? "rounded-full bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-60"
                      : "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground disabled:opacity-60"
                  }
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {trackKey === "pe" ? "PE" : "IB"} stage template from{" "}
          {firm?.name ?? "the firm"}&apos;s track · deterministic cast — same
          firm, same interviewer.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Stage path
        </h2>
        <ol className="space-y-1">
          {stages.map((item, index) => {
            const state =
              phase === "running" || phase === "starting"
                ? index < stageIndex
                  ? "done"
                  : index === stageIndex
                    ? "current"
                    : "todo"
                : "todo"
            return (
              <li
                key={item.id}
                className="relative flex items-center gap-3 py-1.5"
              >
                {index < stages.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute top-8 bottom-[-0.375rem] left-[0.5625rem] border-l border-dashed border-border"
                  />
                ) : null}
                <span
                  aria-hidden
                  className={
                    state === "done"
                      ? "flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border border-ink bg-ink"
                      : "flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border border-ink bg-paper"
                  }
                >
                  {state === "done" ? (
                    <span className="size-1 rounded-full bg-paper" />
                  ) : null}
                </span>
                <span className="font-mono text-[11px] tracking-[0.14em] uppercase">
                  {state === "current" ? (
                    <Annotate type="box" color="var(--ink)" padding={2}>
                      <span className="text-foreground">
                        {item.label} · {item.minutes}m
                      </span>
                    </Annotate>
                  ) : (
                    <span
                      className={
                        state === "done"
                          ? "text-muted-foreground line-through"
                          : "text-muted-foreground"
                      }
                    >
                      {item.label} · {item.minutes}m
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      <InterviewerAvatar
        interviewerId={interviewerId}
        state={interviewerState}
        size={64}
      />

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border border-dashed border-error px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1">{error}</span>
          {phase === "setup" ? (
            <Button size="sm" variant="outline" onClick={() => void start()}>
              Retry
            </Button>
          ) : null}
          {phase === "running" ? (
            <Button size="sm" variant="ghost" onClick={resetToSetup}>
              Abandon mock
            </Button>
          ) : null}
        </div>
      ) : null}

      {phase === "setup" || phase === "starting" ? (
        <RoughHover>
          <Button
            disabled={!firmId || phase === "starting"}
            onClick={() => void start()}
          >
            {phase === "starting"
              ? "Briefing your interviewer…"
              : "Start firm mock"}
          </Button>
        </RoughHover>
      ) : null}

      {phase === "running" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <PaperSheet seedKey={`sim-stage-${session?.id ?? "run"}-${stageIndex}`}>
            {questionLoading ? (
              <p className="text-sm text-muted-foreground">
                Your interviewer is reading the next prompt…
              </p>
            ) : question ? (
              <>
                <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  Stage {stageIndex + 1} of {stages.length}
                  {stage ? ` · ${stage.label} · ~${stage.minutes}m` : ""}
                  {question.topic
                    ? ` · topic: ${question.topic.replace(/_/g, " ")}`
                    : ""}
                </p>
                {timer ? (
                  <div
                    className="mt-3 flex flex-wrap items-center gap-2"
                    aria-live="polite"
                  >
                    <span
                      className={
                        timer.overtime
                          ? "font-mono text-2xl tracking-tight text-error-foreground"
                          : "font-mono text-2xl tracking-tight text-foreground"
                      }
                    >
                      {timer.label}
                    </span>
                    <SemanticPill
                      tone={timer.overtime ? "weak" : "neutral"}
                      icon={false}
                    >
                      {timer.overtime
                        ? `overtime past ${stage?.minutes}m`
                        : "stage clock"}
                    </SemanticPill>
                  </div>
                ) : null}
                <p className="mt-3 text-xl leading-snug font-medium">
                  {question.canonical_wording}
                </p>
                <textarea
                  className="mt-4 min-h-40 w-full border border-border bg-transparent p-3 text-sm leading-relaxed outline-none focus:border-foreground read-only:opacity-70"
                  value={answer}
                  readOnly={Boolean(stageGrade)}
                  onFocus={() => setTyping(true)}
                  onBlur={() => setTyping(false)}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Structure your spoken answer here — then rate yourself honestly. A written answer is graded against the teaching answer; a blank that earned an 'Again' is fine too."
                  aria-label="Your answer"
                />
                {voiceEnabled && !stageGrade ? (
                  <VoiceAnswer
                    className="mt-2"
                    disabled={submitting}
                    onTranscript={(transcript, spoken) => {
                      setAnswer((current) =>
                        current.trim() ? `${current.trim()} ${transcript}` : transcript
                      )
                      setDelivery(spoken)
                    }}
                  />
                ) : null}
                <div aria-live="polite" className="mt-4">
                  {stageGrade ? (
                    <div className="space-y-3">
                      <GradeFeedbackCard
                        grade={stageGrade}
                        activity={stageActivity}
                        onSubmitFollowUp={submitFollowUp}
                      />
                      <RoughHover>
                        <Button onClick={() => void advance()}>
                          {stageIndex + 1 >= stages.length
                            ? "Finish mock — see debrief"
                            : "Next stage →"}
                        </Button>
                      </RoughHover>
                    </div>
                  ) : null}
                  <span className="sr-only">{liveStatus}</span>
                </div>
                {stageGrade ? null : (
                <InkHoverScope className="mt-4 flex flex-wrap items-center gap-2">
                  {RATINGS.map((rating) => (
                    <Button
                      key={rating.label}
                      variant={
                        rating.confidence >= PASS_CONFIDENCE
                          ? "default"
                          : "outline"
                      }
                      disabled={submitting}
                      onClick={() => void submitRating(rating.confidence)}
                    >
                      {rating.label}
                    </Button>
                  ))}
                  <span
                    className="text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    {submitting
                      ? "Grading your answer…"
                      : "Rate yourself, then see the grade."}
                  </span>
                </InkHoverScope>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This stage couldn&apos;t load a question — use the retry above,
                or abandon the mock.
              </p>
            )}
          </PaperSheet>
          {diagramPrompt ? (
            <PaperSheet seedKey={`sim-diagram-${stage?.id ?? "stage"}`}>
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    Diagram prompt
                  </p>
                  <p className="text-sm font-medium">{diagramPrompt.prompt}</p>
                  {stage ? (
                    <Link
                      href={`/concepts/${STAGE_CONCEPT[stage.id]?.slug ?? ""}`}
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Open {STAGE_CONCEPT[stage.id]?.title ?? stage.label} lab →
                    </Link>
                  ) : null}
                </div>
                <DiagramIsland
                  title={diagramPrompt.title}
                  source={diagramPrompt.source}
                  a11yFallback={diagramPrompt.a11y}
                />
              </div>
            </PaperSheet>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
