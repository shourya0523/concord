import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { adminProxyBlocked, decideAdminAccess, isAdminPath, parseAdminEmails } from "./access"

describe("admin access", () => {
  it("parses a comma list case-insensitively", () => {
    assert.deepEqual(
      [...parseAdminEmails(" A@x.com, b@Y.com ,,not-an-email")].sort(),
      ["a@x.com", "b@y.com"],
    )
    assert.equal(parseAdminEmails(undefined).size, 0)
  })

  it("is open in dev without Neon Auth and closed in production", () => {
    const dev = decideAdminAccess({ authConfigured: false, nodeEnv: "development", email: null, adminEmails: "" })
    assert.equal(dev.allowed, true)
    assert.ok(dev.allowed && dev.mode === "dev_open")
    const prod = decideAdminAccess({ authConfigured: false, nodeEnv: "production", email: null, adminEmails: "a@x.com" })
    assert.equal(prod.allowed, false)
    assert.ok(!prod.allowed && prod.status === 503)
  })

  it("requires an allow-listed session email when Neon Auth is configured", () => {
    const base = { authConfigured: true, nodeEnv: "development", adminEmails: "Owner@Concord.dev" }
    const anon = decideAdminAccess({ ...base, email: null })
    assert.ok(!anon.allowed && anon.status === 401)
    const other = decideAdminAccess({ ...base, email: "someone@else.com" })
    assert.ok(!other.allowed && other.status === 403)
    const owner = decideAdminAccess({ ...base, email: "owner@concord.dev" })
    assert.ok(owner.allowed && owner.mode === "allow_list" && owner.email === "owner@concord.dev")
    const empty = decideAdminAccess({ ...base, adminEmails: "", email: "owner@concord.dev" })
    assert.ok(!empty.allowed && empty.status === 403)
  })

  it("recognises admin paths for the proxy", () => {
    assert.equal(isAdminPath("/admin"), true)
    assert.equal(isAdminPath("/admin/review"), true)
    assert.equal(isAdminPath("/api/admin/proposals"), true)
    assert.equal(isAdminPath("/administrator"), false)
    assert.equal(isAdminPath("/learn"), false)
    assert.equal(adminProxyBlocked(false, "production"), true)
    assert.equal(adminProxyBlocked(false, "development"), false)
    assert.equal(adminProxyBlocked(true, "production"), false)
  })
})
