import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { RubricNumericCheck } from "@ibpe/contracts"
import { compareNumeric, extractNumbers, runNumericChecks } from "./numbers"

function check(partial: Partial<RubricNumericCheck> & { expected: number }): RubricNumericCheck {
  return {
    id: "n1",
    label: "value",
    tolerance: 0.02,
    tolerance_kind: "relative",
    unit: null,
    ...partial,
  }
}

describe("extractNumbers", () => {
  it("parses dollars, percents, multiples and commas", () => {
    const nums = extractNumbers("Paid $1,250 at 8.5x EBITDA with a 25% tax rate")
    assert.deepEqual(
      nums.map((n) => [n.value, n.unit]),
      [
        [1250, "$"],
        [8.5, "x"],
        [25, "%"],
      ],
    )
  })

  it("handles the multiplication sign as a multiple", () => {
    const [n] = extractNumbers("trading at 16× EBITDA")
    assert.equal(n?.value, 16)
    assert.equal(n?.unit, "x")
  })

  it("parses scale suffixes and words", () => {
    const nums = extractNumbers("EV of $1.2bn, debt of $500mm, fees $10k, cash 3 million, $2 billion")
    assert.deepEqual(
      nums.map((n) => [n.value, n.scale, n.unit]),
      [
        [1.2, 1e9, "$"],
        [500, 1e6, "$"],
        [10, 1e3, "$"],
        [3, 1e6, null],
        [2, 1e9, "$"],
      ],
    )
  })

  it("parses negatives (hyphen, unicode minus, accounting parentheses)", () => {
    const nums = extractNumbers("PP&E -$10, assets −$7.50, cash ($2.50), rate (25%)")
    assert.deepEqual(
      nums.map((n) => n.value),
      [-10, -7.5, -2.5, 25],
    )
    assert.equal(nums[0]?.signed, true)
    assert.equal(nums[3]?.signed, false)
  })

  it("parses ranges and propagates units to the left end", () => {
    const nums = extractNumbers("typically 8-10x, margins 20 to 25%, and fees of $5–7mm")
    assert.equal(nums.length, 6)
    assert.deepEqual(nums[0]?.range, [8, 10])
    assert.equal(nums[0]?.unit, "x")
    assert.equal(nums[1]?.value, 10)
    assert.equal(nums[2]?.unit, "%")
    assert.deepEqual(nums[3]?.range, [20, 25])
    assert.equal(nums[4]?.scale, 1e6)
    assert.equal(nums[4]?.unit, "$")
    assert.equal(nums[5]?.value, 7)
  })

  it("converts basis points to percent", () => {
    const [n] = extractNumbers("spread of 150bps")
    assert.equal(n?.value, 1.5)
    assert.equal(n?.unit, "%")
  })

  it("ignores digits glued to letters", () => {
    assert.equal(extractNumbers("Q4 results for ebitda2").length, 0)
  })
})

describe("compareNumeric", () => {
  it("treats 25% and 0.25 as equivalent for percent checks", () => {
    const c = check({ expected: 25, unit: "%" })
    assert.equal(compareNumeric(c, extractNumbers("0.25")[0]!).pass, true)
    assert.equal(compareNumeric(c, extractNumbers("25%")[0]!).pass, true)
    const fractional = check({ expected: 0.25, unit: "%" })
    assert.equal(compareNumeric(fractional, extractNumbers("25%")[0]!).pass, true)
  })

  it("rejects incompatible units", () => {
    const c = check({ expected: 25, unit: "%" })
    assert.equal(compareNumeric(c, extractNumbers("25x")[0]!).pass, false)
    const multiple = check({ expected: 8, unit: "x" })
    assert.equal(compareNumeric(multiple, extractNumbers("8%")[0]!).pass, false)
  })

  it("rescales money between bn and mm", () => {
    const c = check({ expected: 500, unit: "$mm" })
    assert.equal(compareNumeric(c, extractNumbers("$0.5bn")[0]!).pass, true)
    assert.equal(compareNumeric(c, extractNumbers("500")[0]!).pass, true)
    assert.equal(compareNumeric(c, extractNumbers("$5bn")[0]!).pass, false)
  })

  it("applies relative and absolute tolerance", () => {
    const rel = check({ expected: 100, tolerance: 0.02 })
    assert.equal(compareNumeric(rel, extractNumbers("101.5")[0]!).pass, true)
    assert.equal(compareNumeric(rel, extractNumbers("103")[0]!).pass, false)
    const abs = check({ expected: 20, tolerance: 0.5, tolerance_kind: "absolute", unit: "%" })
    assert.equal(compareNumeric(abs, extractNumbers("20.4%")[0]!).pass, true)
    assert.equal(compareNumeric(abs, extractNumbers("21%")[0]!).pass, false)
  })

  it("accepts unsigned magnitudes for negative expectations but not the wrong explicit sign", () => {
    const c = check({ expected: -7.5, unit: "$" })
    assert.equal(compareNumeric(c, extractNumbers("net income down $7.50")[0]!).pass, true)
    assert.equal(compareNumeric(c, extractNumbers("-$7.50")[0]!).pass, true)
    const positive = check({ expected: 2.5, unit: "$" })
    assert.equal(compareNumeric(positive, extractNumbers("-$2.50")[0]!).pass, false)
  })
})

describe("runNumericChecks", () => {
  it("finds the matching number anywhere in the answer", () => {
    const results = runNumericChecks(
      [
        check({ id: "ni", label: "Net income change", expected: -7.5, unit: "$" }),
        check({ id: "cash", label: "Cash change", expected: 2.5, unit: "$" }),
        check({ id: "moic", label: "MOIC", expected: 3, unit: "x" }),
      ],
      "Net income falls by $7.50, cash rises $2.50 and PP&E drops $10.",
    )
    assert.deepEqual(
      results.map((r) => [r.id, r.pass]),
      [
        ["ni", true],
        ["cash", true],
        ["moic", false],
      ],
    )
    assert.equal(results[0]?.found, -7.5)
  })

  it("reports the closest wrong number when nothing passes", () => {
    const [r] = runNumericChecks([check({ expected: 7.5, unit: "$" })], "It falls by $6 or $20")
    assert.equal(r?.pass, false)
    assert.equal(r?.found, 6)
  })
})
