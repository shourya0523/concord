import assert from "node:assert/strict"
import test from "node:test"

import { isApiPath, isLoginRedirect, isPublicPath, safeNextPath, signInRedirectPath, withNext } from "./gate"

test("only the landing, auth flow, health, cron, unsubscribe and static files are public", () => {
  for (const path of [
    "/",
    "/sign-in",
    "/sign-up",
    "/api/auth/get-session",
    "/auth/callback",
    "/api/health",
    "/api/cron/notify",
    "/api/notifications/unsubscribe",
    "/_next/static/chunks/app.js",
    "/sw.js",
    "/brand/concord-mark.svg",
    "/favicon.ico",
    "/icon.png",
    "/apple-icon.png",
    "/opengraph-image.png",
    "/twitter-image.png",
    "/manifest.webmanifest",
  ]) {
    assert.ok(isPublicPath(path), path)
  }
  for (const path of [
    "/today",
    "/dashboard",
    "/onboarding",
    "/companies/goldman",
    "/prep/heat",
    "/mockups",
    "/ds",
    "/admin",
    "/api/today",
    "/api/prep/heat",
    "/api/notifications/prefs",
    "/api/profile",
    "/sign-inx",
    "/api/healthz",
  ]) {
    assert.ok(!isPublicPath(path), path)
  }
})

test("isApiPath", () => {
  assert.ok(isApiPath("/api/today"))
  assert.ok(!isApiPath("/apiary"))
})

test("safeNextPath keeps same-site pages and rejects everything else", () => {
  assert.equal(safeNextPath("/today"), "/today")
  assert.equal(safeNextPath("/companies/gs?tab=heat#top"), "/companies/gs?tab=heat#top")
  for (const bad of [
    null,
    "",
    "today",
    "//evil.com",
    "/\\evil.com",
    "https://evil.com/today",
    "javascript:alert(1)",
    "/api/profile",
    "/sign-in",
    "/sign-up",
    "/auth/callback",
    "/to\nday",
  ]) {
    assert.equal(safeNextPath(bad), null, String(bad))
  }
})

test("signed-out visitors go to sign-in with the way back", () => {
  assert.equal(signInRedirectPath("/today"), "/sign-in?next=%2Ftoday")
  assert.equal(signInRedirectPath("/companies/gs", "?tab=heat"), "/sign-in?next=%2Fcompanies%2Fgs%3Ftab%3Dheat")
  assert.equal(signInRedirectPath("/"), "/sign-in")
  assert.equal(withNext("/sign-up", "/today"), "/sign-up?next=%2Ftoday")
  assert.equal(withNext("/sign-up", null), "/sign-up")
})

test("isLoginRedirect spots the middleware's sign-in redirect only", () => {
  const url = "https://concord.app/today"
  assert.ok(isLoginRedirect(307, "https://concord.app/sign-in", url))
  assert.ok(isLoginRedirect(302, "/sign-in", url))
  assert.ok(!isLoginRedirect(200, null, url))
  assert.ok(!isLoginRedirect(307, "https://concord.app/today?code=1", url))
  assert.ok(!isLoginRedirect(307, "https://evil.com/sign-in", url))
})
