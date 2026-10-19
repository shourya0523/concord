/** Invalid or incomplete calculator inputs (mirrors Python `CalculatorError`). */
export class CalculatorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CalculatorError"
  }
}
