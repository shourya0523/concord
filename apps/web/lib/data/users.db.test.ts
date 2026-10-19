/**
 * Opt-in Postgres integration test for ensureAppUserQuery: concurrent first
 * requests for a brand-new user must all succeed (no unique violation on the
 * `id` primary key) and the latest non-null email must stick.
 *
 * Skipped unless RETENTION_DB_TEST_URL (scratch DB with migrations applied,
 * connecting as the non-owner concord_app role) and RETENTION_DB_SHIM
 * (scripts/dev/neon_http_shim.py) are set — same harness as
 * retention.db.test.ts. Never point at Neon.
 */
/* eslint-disable turbo/no-undeclared-env-vars -- opt-in local test, never a build input */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

const DSN = process.env.RETENTION_DB_TEST_URL
const SHIM = process.env.RETENTION_DB_SHIM
const enabled = Boolean(DSN && SHIM)
const CONCURRENCY = 15

describe("ensureAppUserQuery on Postgres (opt-in)", { skip: !enabled }, () => {
  it("survives concurrent first requests and keeps the email", async () => {
    const { neonConfig } = await import("@neondatabase/serverless")
    neonConfig.fetchEndpoint = SHIM as string
    process.env.DATABASE_URL = DSN
    const { resetDbClients } = await import("@ibpe/database")
    resetDbClients()

    const { requireSql } = await import("@/lib/db/client")
    const { withRlsUserId } = await import("@/lib/db/rls")
    const { ensureAppUserQuery } = await import("./users")
    const sql = requireSql()

    const userId = `users_db_race_${Date.now()}`
    const outcomes = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        withRlsUserId(sql, userId, (s) => [
          // Mix null and real emails, like routes that do / don't pass one.
          ensureAppUserQuery(s, userId, i % 2 ? `race@example.com` : null),
        ]),
      ),
    )
    const failures = outcomes.filter((o) => o.status === "rejected")
    assert.equal(
      failures.length,
      0,
      `concurrent ensureAppUserQuery failed: ${failures.map((f) => String((f as PromiseRejectedResult).reason)).join("; ")}`,
    )

    // A later call with no email must not wipe it; a new email replaces it.
    await withRlsUserId(sql, userId, (s) => [ensureAppUserQuery(s, userId)])
    const [kept] = await withRlsUserId(sql, userId, (s) => [
      s`SELECT id, email FROM app.users WHERE neon_auth_user_id = ${userId}`,
    ])
    assert.deepEqual(kept, [{ id: userId, email: "race@example.com" }])

    await withRlsUserId(sql, userId, (s) => [ensureAppUserQuery(s, userId, "new@example.com")])
    const [updated] = await withRlsUserId(sql, userId, (s) => [
      s`SELECT email FROM app.users WHERE neon_auth_user_id = ${userId}`,
    ])
    assert.deepEqual(updated, [{ email: "new@example.com" }])
  })
})
