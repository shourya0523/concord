/**
 * Rubric scoring (grader v2, plan P3.2 / KD-1 / KD-2): the model ticks boxes,
 * code computes the score. Pure — no I/O, no server imports.
 *
 *   score   = Σ weight·{hit 1, partial .5, miss 0} / Σ weight − 0.15·red flags
 *             clamped to 0..1, capped at 0.6 when any must-have is not hit
 *   correct = score ≥ 0.7 ∧ every must-have hit
 *
 * Numeric checks are scored items too: each weighs as much as an average key
 * point. Evidence quotes must appear in the answer (normalised) or the verdict
 * is downgraded to miss.
 */
import {
  AnswerRubricSchema,
  type AnswerRubric,
  type NumericCheckResult,
  type RubricItemResult,
  type RubricKeyPoint,
  type RubricVerdict,
} from "@ibpe/contracts"
import {
  contentTokens,
  normaliseForMatch,
  normaliseLoose,
  sentences,
  stem,
  STOP_WORDS,
  tokenSet,
  wordTokens,
} from "./text"

export const PASS_THRESHOLD = 0.7
export const MUST_HAVE_CAP = 0.6
export const RED_FLAG_PENALTY = 0.15
export const VERDICT_CREDIT: Record<RubricVerdict, number> = {
  hit: 1,
  partial: 0.5,
  miss: 0,
}

/** Lenient parse of `canonical.answers.rubric_json` (object or JSON string). */
export function parseRubric(raw: unknown): AnswerRubric | null {
  if (raw == null) return null
  let value = raw
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  const parsed = AnswerRubricSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** True when the rubric should be graded by numbers alone (no LLM). */
export function isNumericOnlyRubric(rubric: AnswerRubric): boolean {
  return rubric.numeric_checks.length > 0 && rubric.kind === "numeric"
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`
  }
  return JSON.stringify(value)
}

/**
 * Short, stable fingerprint of the grading-relevant rubric content (FNV-1a).
 * Part of the grade cache key so an edited rubric never serves stale grades.
 */
export function rubricFingerprint(rubric: AnswerRubric | null): string {
  if (!rubric) return "none"
  const material = stableStringify({
    v: rubric.version,
    k: rubric.kind,
    kp: rubric.key_points,
    rf: rubric.red_flags,
    fu: rubric.follow_ups,
    nc: rubric.numeric_checks,
  })
  let hash = 0x811c9dc5
  for (let i = 0; i < material.length; i += 1) {
    hash ^= material.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${rubric.version}:${hash.toString(16).padStart(8, "0")}`
}

/* ------------------------------------------------------------------ */
/* Evidence verification                                               */
/* ------------------------------------------------------------------ */

function stripQuotes(text: string): string {
  return text.replace(/^[\s"'`“”‘’]+|[\s"'`“”‘’]+$/g, "")
}

/**
 * True when `evidence` (or each `...`-separated fragment of it) appears in the
 * answer after whitespace/case/unicode normalisation (punctuation-insensitive
 * as a second pass). Empty or trivial quotes never verify.
 */
export function verifyEvidence(answer: string, evidence: string | null | undefined): boolean {
  if (!evidence) return false
  const fragments = evidence
    .split(/\.{3,}|…/)
    .map(stripQuotes)
    .filter((fragment) => /[a-z0-9]/i.test(fragment))
  if (fragments.length === 0) return false
  const substantive = fragments.some((fragment) =>
    wordTokens(fragment).some((t) => !STOP_WORDS.has(t)),
  )
  if (!substantive) return false
  const hay = normaliseForMatch(answer)
  const hayLoose = normaliseLoose(answer)
  return fragments.every((fragment) => {
    const needle = normaliseForMatch(fragment)
    if (needle.length < 2) return false
    if (hay.includes(needle)) return true
    const loose = normaliseLoose(fragment)
    return loose.length >= 2 && hayLoose.includes(loose)
  })
}

export type JudgedKeyPoint = {
  id: string
  verdict: RubricVerdict
  evidence?: string | null
}

/**
 * Merge model (or heuristic) verdicts onto the rubric key points. Missing ids
 * become misses; hit/partial without verifiable evidence is downgraded to miss.
 */
export function applyVerdicts(
  keyPoints: RubricKeyPoint[],
  verdicts: JudgedKeyPoint[],
  answer: string,
  options: { requireEvidence?: boolean } = {},
): { items: RubricItemResult[]; downgraded: string[] } {
  const requireEvidence = options.requireEvidence ?? true
  const byId = new Map(verdicts.map((v) => [v.id, v]))
  const downgraded: string[] = []
  const items = keyPoints.map((kp) => {
    const judged = byId.get(kp.id)
    let verdict: RubricVerdict = judged?.verdict ?? "miss"
    let evidence = judged?.evidence?.trim() || null
    if (verdict !== "miss" && requireEvidence && !verifyEvidence(answer, evidence)) {
      downgraded.push(kp.id)
      verdict = "miss"
      evidence = null
    }
    if (verdict === "miss") evidence = null
    return {
      id: kp.id,
      text: kp.text,
      weight: kp.weight,
      must_have: kp.must_have,
      verdict,
      evidence,
    }
  })
  return { items, downgraded }
}

/* ------------------------------------------------------------------ */
/* Score                                                               */
/* ------------------------------------------------------------------ */

export type RubricScore = {
  score: number
  correct: boolean
  must_haves_hit: boolean
  /** Weighted credit before red-flag penalty and must-have cap. */
  raw: number
}

export function scoreRubric(options: {
  items: Array<Pick<RubricItemResult, "weight" | "must_have" | "verdict">>
  numeric?: Array<Pick<NumericCheckResult, "pass">>
  redFlagCount?: number
}): RubricScore {
  const items = options.items
  const numeric = options.numeric ?? []
  const kpTotal = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0)
  const avgWeight = items.length > 0 ? (kpTotal > 0 ? kpTotal / items.length : 1) : 1
  let weightSum = 0
  let credit = 0
  for (const item of items) {
    const w = kpTotal > 0 ? Math.max(0, item.weight) : 1
    weightSum += w
    credit += w * VERDICT_CREDIT[item.verdict]
  }
  for (const check of numeric) {
    weightSum += avgWeight
    credit += check.pass ? avgWeight : 0
  }
  const raw = weightSum > 0 ? credit / weightSum : 0
  let score = raw - RED_FLAG_PENALTY * Math.max(0, options.redFlagCount ?? 0)
  score = Math.min(1, Math.max(0, score))
  const mustHavesHit = items.filter((i) => i.must_have).every((i) => i.verdict === "hit")
  if (!mustHavesHit) score = Math.min(score, MUST_HAVE_CAP)
  score = Number(score.toFixed(3))
  return {
    score,
    correct: score >= PASS_THRESHOLD && mustHavesHit,
    must_haves_hit: mustHavesHit,
    raw: Number(raw.toFixed(3)),
  }
}

/** Numeric-only rubric: fraction of checks passed; same pass threshold. */
export function scoreNumericOnly(numeric: NumericCheckResult[]): RubricScore {
  const passed = numeric.filter((n) => n.pass).length
  const score = numeric.length ? Number((passed / numeric.length).toFixed(3)) : 0
  return { score, correct: score >= PASS_THRESHOLD, must_haves_hit: true, raw: score }
}

/* ------------------------------------------------------------------ */
/* Follow-up                                                           */
/* ------------------------------------------------------------------ */

export function followUpId(index: number): string {
  return `f${index + 1}`
}

export function redFlagId(index: number): string {
  return `r${index + 1}`
}

/**
 * Interviewer follow-up: the model's pick when it names a valid id, otherwise
 * the follow-up that best targets the heaviest missed/partial key point.
 * Null when every key point was hit and the model chose nothing.
 */
export function chooseFollowUp(
  rubric: Pick<AnswerRubric, "follow_ups" | "key_points">,
  items: Array<Pick<RubricItemResult, "id" | "verdict" | "weight" | "must_have">>,
  modelFollowUpId?: string | null,
): string | null {
  const followUps = rubric.follow_ups.filter((f) => f.trim().length > 0)
  if (followUps.length === 0) return null
  if (modelFollowUpId) {
    const match = /^f(\d+)$/i.exec(modelFollowUpId.trim())
    const idx = match ? Number(match[1]) - 1 : -1
    if (idx >= 0 && idx < followUps.length) return followUps[idx] ?? null
  }
  const missed = items
    .filter((i) => i.verdict !== "hit")
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        Number(b.must_have) - Number(a.must_have) ||
        (a.verdict === "miss" ? -1 : 1),
    )
  const target = missed[0]
  if (!target) return null
  const kp = rubric.key_points.find((k) => k.id === target.id)
  const targetTokens = tokenSet(`${kp?.text ?? ""} ${(kp?.cues ?? []).join(" ")}`)
  let best = followUps[0] ?? null
  let bestOverlap = 0
  for (const f of followUps) {
    const overlap = [...tokenSet(f)].filter((t) => targetTokens.has(t)).length
    if (overlap > bestOverlap) {
      best = f
      bestOverlap = overlap
    }
  }
  return best
}

/* ------------------------------------------------------------------ */
/* Deterministic rubric fallback                                       */
/* ------------------------------------------------------------------ */

function cueTokens(cue: string): string[] {
  return wordTokens(cue)
    .filter((t) => !STOP_WORDS.has(t))
    .map(stem)
}

/**
 * A cue matches when all its content tokens occur in the answer (any order).
 * `a|b|c` lists alternatives (synonyms, spellings) — any one matching counts.
 */
export function cueMatches(cue: string, answerTokens: Set<string>, answerNorm: string): boolean {
  return cue
    .split("|")
    .map((alt) => alt.trim())
    .filter(Boolean)
    .some((alt) => {
      const toks = cueTokens(alt)
      if (toks.length === 0) {
        const needle = normaliseForMatch(alt)
        return needle.length > 0 && answerNorm.includes(needle)
      }
      return toks.every((t) => answerTokens.has(t))
    })
}

function answerTokenSet(answer: string): Set<string> {
  // Keep short tokens (EV, PE, D&A pieces) for cue matching.
  return new Set(
    wordTokens(answer)
      .filter((t) => !STOP_WORDS.has(t))
      .map(stem),
  )
}

function bestEvidenceSentence(answer: string, tokens: string[]): string | null {
  if (tokens.length === 0) return null
  const wanted = new Set(tokens)
  let best: string | null = null
  let bestHits = 0
  for (const sentence of sentences(answer)) {
    const toks = answerTokenSet(sentence)
    let hits = 0
    for (const t of wanted) if (toks.has(t)) hits += 1
    if (hits > bestHits) {
      best = sentence
      bestHits = hits
    }
  }
  return best ? best.slice(0, 240) : null
}

/** Heuristic verdict for one key point from its cues (or its text tokens). */
export function judgeKeyPointDeterministic(
  kp: Pick<RubricKeyPoint, "id" | "text" | "cues">,
  answer: string,
): JudgedKeyPoint & { coverage: number } {
  const answerTokens = answerTokenSet(answer)
  const answerNorm = normaliseForMatch(answer)
  const cues = (kp.cues ?? []).filter((c) => c.trim().length > 0)
  if (cues.length > 0) {
    const matched = cues.filter((cue) => cueMatches(cue, answerTokens, answerNorm))
    const coverage = matched.length / cues.length
    const verdict: RubricVerdict =
      coverage >= 0.5 || matched.length >= 3 ? "hit" : matched.length >= 1 ? "partial" : "miss"
    return {
      id: kp.id,
      verdict,
      coverage,
      evidence:
        verdict === "miss"
          ? null
          : bestEvidenceSentence(answer, matched.flatMap((c) => c.split("|").flatMap(cueTokens))),
    }
  }
  const toks = [...new Set(contentTokens(kp.text))]
  const hits = toks.filter((t) => answerTokens.has(t))
  const coverage = toks.length ? hits.length / toks.length : 0
  const verdict: RubricVerdict = coverage >= 0.6 ? "hit" : coverage >= 0.3 ? "partial" : "miss"
  return {
    id: kp.id,
    verdict,
    coverage,
    evidence: verdict === "miss" ? null : bestEvidenceSentence(answer, hits),
  }
}
