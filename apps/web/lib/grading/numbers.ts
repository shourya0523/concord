/**
 * Numeric pre-check (plan P3.1, KD-3): numbers are checked by code, never by
 * the LLM. Pure — safe for tests, evals and client code.
 *
 *   extractNumbers("EV of $1.2bn at 8–10x, 25% margin")
 *     → [{value:1.2, scale:1e9, unit:"$"}, {value:8, unit:"x", range}, …]
 *   compareNumeric(check, found) → pass / fail with unit + scale awareness
 */
import type {
  NumericCheckResult,
  RubricNumericCheck,
} from "@ibpe/contracts"
import { normaliseForMatch } from "./text"

export type NumberUnit = "%" | "x" | "$" | "years" | null

export type ExtractedNumber = {
  /** Value as written, sign applied, before `scale` (e.g. 1.2 for "$1.2bn"). */
  value: number
  /** Multiplier implied by a suffix (bn → 1e9, mm/m → 1e6, k → 1e3); null if none. */
  scale: number | null
  unit: NumberUnit
  /** True when the text carried an explicit sign (-, −, parentheses, "negative"). */
  signed: boolean
  /** Both ends when the number is part of a range ("8-10x", "20 to 25%"). */
  range: [number, number] | null
  raw: string
  index: number
}

const SCALE_WORDS: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  mn: 1e6,
  mil: 1e6,
  million: 1e6,
  millions: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  billions: 1e9,
  t: 1e12,
  tn: 1e12,
  trillion: 1e12,
}

const NUMBER_RE =
  /(\()?(-|\+)?\s?(\$|usd\s?)?\s?(-)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(?!\d)\s?(bps|basis points?|%|percent|per cent|pct|x\b|times\b|k\b|thousand\b|mm\b|mn\b|m\b|mil\b|millions?\b|bn\b|b\b|billions?\b|tn\b|t\b|trillion\b|years?\b|yrs?\b)?(\))?/gi

const RANGE_JOINER = /^\s*(?:-|to|–|—|and)\s*$/i

function parseUnit(suffix: string | undefined, hasDollar: boolean): {
  unit: NumberUnit
  scale: number | null
  bps: boolean
} {
  const s = (suffix ?? "").toLowerCase().trim()
  if (s === "%" || s === "percent" || s === "per cent" || s === "pct") {
    return { unit: "%", scale: null, bps: false }
  }
  if (s.startsWith("bps") || s.startsWith("basis point")) {
    return { unit: "%", scale: null, bps: true }
  }
  if (s === "x" || s === "times") return { unit: "x", scale: null, bps: false }
  if (s.startsWith("year") || s.startsWith("yr")) {
    return { unit: "years", scale: null, bps: false }
  }
  if (s in SCALE_WORDS) {
    // Bare "m"/"b"/"t" after a number without "$" is too ambiguous (e.g. "5 m" metres).
    if (!hasDollar && (s === "m" || s === "b" || s === "t")) {
      return { unit: null, scale: SCALE_WORDS[s] ?? null, bps: false }
    }
    return { unit: hasDollar ? "$" : null, scale: SCALE_WORDS[s] ?? null, bps: false }
  }
  return { unit: hasDollar ? "$" : null, scale: null, bps: false }
}

/**
 * Extract every number in `text` with sign, unit and scale. Handles `$`, `%`,
 * `x`/`×`, `bps`, `k/mm/m/bn/tn` (+ words), thousands commas, unicode minus,
 * accounting parentheses and ranges ("8-10x", "20 to 25%", "$5–7mm").
 */
export function extractNumbers(text: string): ExtractedNumber[] {
  const source = normaliseForMatch(text)
  const found: ExtractedNumber[] = []
  NUMBER_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = NUMBER_RE.exec(source)) !== null) {
    const [raw, openParen, sign, dollar, innerMinus, digits, suffix, closeParen] = match
    if (!digits) continue
    const start = match.index + (raw.length - raw.trimStart().length)
    const prevChar = start > 0 ? source[start - 1] : " "
    // Skip digits glued to letters (e.g. "q4", "ebitda2") and version-like ids.
    if (/[a-z_]/.test(prevChar ?? "") && !dollar && !sign) continue
    let value = Number(digits.replace(/,/g, ""))
    if (!Number.isFinite(value)) continue
    const hasDollar = Boolean(dollar)
    const { unit, scale, bps } = parseUnit(suffix, hasDollar)
    // A leading "-" directly after another number is a range joiner, not a sign.
    const prev = found[found.length - 1]
    const gap = prev ? source.slice(prev.index + prev.raw.length, start) : ""
    const minusIsJoiner =
      sign === "-" && prev !== undefined && /^\s*$/.test(gap) && !innerMinus
    const negative =
      (sign === "-" && !minusIsJoiner) ||
      innerMinus === "-" ||
      // Accounting negatives only for money ("($7.50)"); "(25%)" is usually an aside.
      (Boolean(openParen) && Boolean(closeParen) && hasDollar)
    if (bps) value = value / 100
    if (negative) value = -value
    const signed = negative || sign === "+"
    const item: ExtractedNumber = {
      value,
      scale,
      unit,
      signed,
      range: null,
      raw: raw.trim(),
      index: start,
    }

    const joinerText = minusIsJoiner ? "-" : gap
    if (prev && prev.range === null && RANGE_JOINER.test(joinerText)) {
      // Propagate the right-hand unit/scale to the left end ("8-10x", "$5-7mm").
      if (prev.unit === null && item.unit !== null) prev.unit = item.unit
      if (prev.scale === null && item.scale !== null) prev.scale = item.scale
      if (item.unit === null && prev.unit !== null) item.unit = prev.unit
      if (item.scale === null && prev.scale !== null) item.scale = prev.scale
      const lo = Math.min(prev.value, item.value)
      const hi = Math.max(prev.value, item.value)
      prev.range = [lo, hi]
      item.range = [lo, hi]
    }
    found.push(item)
  }
  return found
}

const UNIT_SCALE: Record<string, number> = {
  $: 1,
  usd: 1,
  $k: 1e3,
  $mm: 1e6,
  $m: 1e6,
  $bn: 1e9,
  $b: 1e9,
}

type CheckFamily = "percent" | "multiple" | "money" | "years" | "plain"

function checkFamily(unit: string | null | undefined): CheckFamily {
  const u = (unit ?? "").toLowerCase().trim()
  if (u === "%" || u === "pct" || u === "percent") return "percent"
  if (u === "x" || u === "multiple") return "multiple"
  if (u.startsWith("$") || u === "usd") return "money"
  if (u.startsWith("year")) return "years"
  return "plain"
}

function within(found: number, expected: number, check: Pick<RubricNumericCheck, "tolerance" | "tolerance_kind">): boolean {
  const tol = check.tolerance ?? 0.02
  if ((check.tolerance_kind ?? "relative") === "absolute") {
    return Math.abs(found - expected) <= tol + 1e-9
  }
  const denom = Math.max(Math.abs(expected), 1e-9)
  return Math.abs(found - expected) / denom <= tol + 1e-9
}

/** Candidate interpretations of `found` in the check's unit system. */
function candidateValues(check: RubricNumericCheck, found: ExtractedNumber): number[] {
  const family = checkFamily(check.unit)
  const v = found.value
  switch (family) {
    case "percent":
      if (found.unit === "%") return [v]
      if (found.unit !== null) return []
      // "0.25" means 25% ; "25" alone may already be in percent points.
      return Math.abs(v) <= 1.5 ? [v * 100, v] : [v]
    case "multiple":
      if (found.unit === "x" || found.unit === null) return [v * (found.scale ?? 1)]
      return []
    case "years":
      if (found.unit === "years" || found.unit === null) return [v]
      return []
    case "money": {
      if (found.unit !== null && found.unit !== "$") return []
      const unitScale = UNIT_SCALE[(check.unit ?? "$").toLowerCase().replace(/\s/g, "")] ?? 1
      // Explicit suffix → absolute dollars, re-expressed in the check's unit.
      if (found.scale !== null) return [(v * found.scale) / unitScale]
      return [v]
    }
    case "plain":
    default:
      if (found.unit === "%") return [v, v / 100]
      return [v * (found.scale ?? 1), v]
  }
}

function expectedValues(check: RubricNumericCheck): number[] {
  const e = check.expected
  if (checkFamily(check.unit) === "percent" && Math.abs(e) <= 1.5 && e !== 0) {
    // Authors sometimes store 25% as 0.25 — accept both conventions.
    return [e * 100, e]
  }
  return [e]
}

export type NumericComparison = {
  pass: boolean
  /** Found value re-expressed in the check's unit (null when units are incompatible). */
  normalised: number | null
  /** |normalised - expected| / |expected| (or absolute diff for absolute checks). */
  error: number | null
}

/**
 * Compare one extracted number against a rubric numeric check with
 * relative/absolute tolerance and unit awareness (25% ≡ 0.25, $0.5bn ≡ $500mm).
 * Unsigned magnitudes match negative expectations ("net income down $7.50"
 * is fine for expected −7.5); an explicit wrong sign fails.
 */
export function compareNumeric(check: RubricNumericCheck, found: ExtractedNumber): NumericComparison {
  let best: NumericComparison = { pass: false, normalised: null, error: null }
  for (const candidate of candidateValues(check, found)) {
    for (const expected of expectedValues(check)) {
      const options = [candidate]
      if (!found.signed && expected < 0 && candidate > 0) options.push(-candidate)
      for (const value of options) {
        const diff = Math.abs(value - expected)
        const error =
          (check.tolerance_kind ?? "relative") === "absolute"
            ? diff
            : diff / Math.max(Math.abs(expected), 1e-9)
        const pass = within(value, expected, check)
        if (pass) return { pass: true, normalised: value, error }
        if (best.error === null || error < best.error) {
          best = { pass: false, normalised: value, error }
        }
      }
    }
  }
  return best
}

/** Run every numeric check against the answer text; best matching number wins. */
export function runNumericChecks(
  checks: RubricNumericCheck[],
  text: string,
): NumericCheckResult[] {
  if (checks.length === 0) return []
  const numbers = extractNumbers(text)
  return checks.map((check) => {
    let closest: NumericComparison | null = null
    for (const n of numbers) {
      const cmp = compareNumeric(check, n)
      if (cmp.pass) {
        closest = cmp
        break
      }
      if (cmp.normalised !== null && (closest === null || (cmp.error ?? Infinity) < (closest.error ?? Infinity))) {
        closest = cmp
      }
    }
    return {
      id: check.id,
      label: check.label,
      expected: check.expected,
      found: closest?.normalised ?? null,
      pass: closest?.pass ?? false,
      unit: check.unit ?? null,
    }
  })
}
