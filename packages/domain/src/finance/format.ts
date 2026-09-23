/**
 * Deterministic number formatting for drill prompts/explanations (no Intl, so
 * output is identical on every runtime and locale).
 */
import { roundTo } from "./rng.js"

/** Up to `maxDecimals` decimals, trailing zeros stripped, thousands commas. */
export function fmtNum(value: number, maxDecimals = 2): string {
  const rounded = roundTo(value, maxDecimals)
  const negative = rounded < 0
  let text = Math.abs(rounded).toFixed(maxDecimals)
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "")
  const [int, frac] = text.split(".") as [string, string | undefined]
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const body = frac ? `${withCommas}.${frac}` : withCommas
  return negative && body !== "0" ? `−${body}` : body
}

/** `$1,250mm`, `−$12.5mm`. */
export function fmtMm(value: number, maxDecimals = 1): string {
  const body = fmtNum(Math.abs(value), maxDecimals)
  return `${value < 0 && body !== "0" ? "−" : ""}$${body}mm`
}

/** `$42.50` style per-share / EPS amounts. */
export function fmtUsd(value: number, decimals = 2): string {
  const body = Math.abs(roundTo(value, decimals)).toFixed(decimals)
  const [int, frac] = body.split(".") as [string, string | undefined]
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${value < 0 && roundTo(value, decimals) !== 0 ? "−" : ""}$${frac ? `${withCommas}.${frac}` : withCommas}`
}

/** Fraction → percent text: 0.075 → `7.5%`. */
export function fmtPct(fraction: number, maxDecimals = 2): string {
  return `${fmtNum(fraction * 100, maxDecimals)}%`
}

/** `2.25x`. */
export function fmtX(value: number, maxDecimals = 2): string {
  return `${fmtNum(value, maxDecimals)}x`
}

/** Signed change: `+$2.5`, `−$7.5`. */
export function fmtSigned(value: number, maxDecimals = 2, prefix = "$"): string {
  const r = roundTo(value, maxDecimals)
  if (r === 0) return `${prefix}0`
  return `${r > 0 ? "+" : "−"}${prefix}${fmtNum(Math.abs(r), maxDecimals)}`
}
