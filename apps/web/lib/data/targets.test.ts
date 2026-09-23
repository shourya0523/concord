import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getTargetCompanySet } from "./targets"

describe("getTargetCompanySet", () => {
  it("returns an empty target set for a new user instead of throwing", async () => {
    const saved = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    try {
      const result = await getTargetCompanySet("new_user_without_targets")
      assert.deepEqual(result.target_set.firm_ids, [])
      assert.equal(result.source, "stub")
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved
    }
  })
})
