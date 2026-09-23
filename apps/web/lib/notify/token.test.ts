import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { describe, it } from "node:test"
import {
  signingSecret,
  signUnsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from "./token"

const SECRET = "test-secret-please-rotate"
const NOW = new Date("2026-09-23T12:00:00Z")

describe("unsubscribe tokens", () => {
  it("round-trips the user id and action", () => {
    const token = signUnsubscribeToken("user_123", SECRET, { now: NOW })
    assert.deepEqual(verifyUnsubscribeToken(token, SECRET), {
      u: "user_123",
      a: "email",
      t: Math.floor(NOW.getTime() / 1000),
    })
  })

  it("is URL-safe and carries no email address", () => {
    const token = signUnsubscribeToken("user_123", SECRET, { now: NOW })
    assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    const body = Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")
    assert.ok(!body.includes("@"))
  })

  it("rejects a different secret", () => {
    const token = signUnsubscribeToken("user_123", SECRET)
    assert.equal(verifyUnsubscribeToken(token, "other-secret"), null)
  })

  it("rejects a tampered payload (swap user id, keep signature)", () => {
    const token = signUnsubscribeToken("user_123", SECRET, { now: NOW })
    const [, sig] = token.split(".")
    const forged = Buffer.from(
      JSON.stringify({ u: "victim", a: "email", t: Math.floor(NOW.getTime() / 1000) }),
    ).toString("base64url")
    assert.equal(verifyUnsubscribeToken(`${forged}.${sig}`, SECRET), null)
  })

  it("rejects a tampered signature", () => {
    const token = signUnsubscribeToken("user_123", SECRET)
    const [body, sig] = token.split(".") as [string, string]
    const flipped = sig.slice(0, -2) + (sig.endsWith("AA") ? "BB" : "AA")
    assert.equal(verifyUnsubscribeToken(`${body}.${flipped}`, SECRET), null)
  })

  it("rejects malformed input and missing secrets", () => {
    for (const bad of ["", "abc", "a.b.c", "!!.??", null, undefined]) {
      assert.equal(verifyUnsubscribeToken(bad as string, SECRET), null, String(bad))
    }
    const token = signUnsubscribeToken("user_123", SECRET)
    assert.equal(verifyUnsubscribeToken(token, null), null)
    assert.throws(() => signUnsubscribeToken("user_123", ""))
  })

  it("rejects a validly signed payload with an unknown action", () => {
    const token = signUnsubscribeToken("user_123", SECRET)
    // Re-sign a crafted body with the right secret to prove schema checks run.
    const body = Buffer.from(JSON.stringify({ u: "user_123", a: "delete_account", t: 1 })).toString(
      "base64url",
    )
    const sig = createHmac("sha256", SECRET).update(`concord-unsub.v1.${body}`).digest("base64url")
    assert.equal(verifyUnsubscribeToken(`${body}.${sig}`, SECRET), null)
    assert.notEqual(verifyUnsubscribeToken(token, SECRET), null)
  })

  it("prefers NOTIFY_SIGNING_SECRET and falls back to CRON_SECRET", () => {
    assert.equal(signingSecret({ NOTIFY_SIGNING_SECRET: "a", CRON_SECRET: "b" } as never), "a")
    assert.equal(signingSecret({ CRON_SECRET: "b" } as never), "b")
    assert.equal(signingSecret({ NOTIFY_SIGNING_SECRET: "  " } as never), null)
  })

  it("builds the unsubscribe URL", () => {
    assert.equal(
      unsubscribeUrl("https://concord.example/", "ab.cd"),
      "https://concord.example/api/notifications/unsubscribe?token=ab.cd",
    )
  })
})
