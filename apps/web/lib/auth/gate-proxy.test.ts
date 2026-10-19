import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest, NextResponse } from "next/server"

import { gateRequest, type Protect } from "./gate-proxy"

const ORIGIN = "https://concord.app"
const req = (path: string) => new NextRequest(new URL(path, ORIGIN))

/** Stands in for Neon Auth's middleware with no session: redirect to /sign-in. */
const signedOut: Protect = (request) => {
  const res = NextResponse.redirect(new URL("/sign-in", request.url))
  res.headers.append("Set-Cookie", "__Secure-neon-auth.session_data=; Max-Age=0; Path=/")
  return res
}
const signedIn: Protect = () => NextResponse.next()
let protectCalls = 0
const counting: Protect = (request) => {
  protectCalls += 1
  return signedOut(request)
}

test("signed-out page visits go to sign-in with the way back", async () => {
  const res = await gateRequest(req("/companies/gs?tab=heat"), signedOut)
  assert.equal(res.status, 307)
  assert.equal(res.headers.get("location"), `${ORIGIN}/sign-in?next=%2Fcompanies%2Fgs%3Ftab%3Dheat`)
  assert.match(res.headers.get("set-cookie") ?? "", /session_data=;/)
})

test("signed-out API calls get a JSON 401, not a redirect", async () => {
  const res = await gateRequest(req("/api/today"), signedOut)
  assert.equal(res.status, 401)
  assert.equal(res.headers.get("location"), null)
  const body = (await res.json()) as { error: { code: string } }
  assert.equal(body.error.code, "unauthorized")
})

test("public paths never reach the auth middleware", async () => {
  protectCalls = 0
  for (const path of ["/", "/sign-in", "/sign-up", "/api/auth/get-session", "/api/health", "/api/cron/notify", "/sw.js"]) {
    const res = await gateRequest(req(path), counting)
    assert.equal(res.status, 200, path)
  }
  assert.equal(protectCalls, 0)
})

test("signed-in requests pass through untouched", async () => {
  for (const path of ["/today", "/api/today"]) {
    const res = await gateRequest(req(path), signedIn)
    assert.equal(res.status, 200, path)
    assert.equal(res.headers.get("location"), null)
  }
})

test("other middleware redirects (OAuth code exchange) are left alone", async () => {
  const oauth: Protect = (request) => NextResponse.redirect(new URL("/today", request.url))
  const res = await gateRequest(req("/today?neon_auth_session_verifier=x"), oauth)
  assert.equal(res.headers.get("location"), `${ORIGIN}/today`)
})
