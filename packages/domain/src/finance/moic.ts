import { CalculatorError } from "./errors.js"

/** Multiple on invested capital = exit / entry. Parity: calculators.py `moic`. */
export function moic({
  entry_equity,
  exit_equity,
}: {
  entry_equity: number
  exit_equity: number
}): number {
  if (entry_equity === 0) throw new CalculatorError("entry_equity must be non-zero")
  return exit_equity / entry_equity
}
