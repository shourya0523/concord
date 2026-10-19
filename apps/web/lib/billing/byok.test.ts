import assert from "node:assert/strict"
import test from "node:test"

import {
  byokCipherKey,
  decryptKey,
  encryptKey,
  envWithKey,
  keyLast4,
  looksLikeOpenRouterKey,
  verifyOpenRouterKey,
} from "./byok"

const KEY = "sk-or-v1-0123456789abcdef0123456789abcdef"
const asEnv = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

test("round-trips under the same cipher key, fails under another", () => {
  const a = byokCipherKey(asEnv({ BYOK_ENCRYPTION_KEY: "one" }))!
  const b = byokCipherKey(asEnv({ BYOK_ENCRYPTION_KEY: "two" }))!
  const blob = encryptKey(KEY, a)
  assert.ok(!blob.includes(KEY))
  assert.notEqual(encryptKey(KEY, a), blob, "fresh IV each time")
  assert.equal(decryptKey(blob, a), KEY)
  assert.equal(decryptKey(blob, b), null)
  assert.equal(decryptKey("garbage", a), null)
})

test("BYOK is off in production without BYOK_ENCRYPTION_KEY", () => {
  assert.equal(byokCipherKey(asEnv({ NODE_ENV: "production" })), null)
  assert.ok(byokCipherKey(asEnv({ NODE_ENV: "development" })))
})

test("key shape, masking and env override", () => {
  assert.ok(looksLikeOpenRouterKey(KEY))
  assert.ok(!looksLikeOpenRouterKey("sk-ant-123"))
  assert.ok(!looksLikeOpenRouterKey(`${KEY} `))
  assert.equal(keyLast4(KEY), "cdef")
  const base = asEnv({ OPENROUTER_API_KEY: "ours", X: "1" })
  assert.equal(envWithKey(KEY, base).OPENROUTER_API_KEY, KEY)
  assert.equal(envWithKey(KEY, base).X, "1")
  assert.equal(envWithKey(null, base), base)
})

test("verifyOpenRouterKey maps OpenRouter's answer", async () => {
  const env = asEnv({ OPENROUTER_BASE_URL: "https://or.test/api/v1" })
  let seen = ""
  const ok = await verifyOpenRouterKey(KEY, {
    env,
    fetch: async (url, init) => {
      seen = `${String(url)} ${new Headers(init?.headers).get("authorization")}`
      return new Response("{}", { status: 200 })
    },
  })
  assert.deepEqual(ok, { ok: true })
  assert.equal(seen, `https://or.test/api/v1/key Bearer ${KEY}`)

  const bad = await verifyOpenRouterKey(KEY, { env, fetch: async () => new Response("", { status: 401 }) })
  assert.equal(bad.ok ? null : bad.reason, "invalid")
  const down = await verifyOpenRouterKey(KEY, {
    env,
    fetch: async () => {
      throw new Error("offline")
    },
  })
  assert.equal(down.ok ? null : down.reason, "unreachable")
})
