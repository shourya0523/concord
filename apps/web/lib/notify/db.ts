/**
 * Cross-user DB connection for cron jobs (notify cron, league XP refresh).
 *
 * The cron spans every user, so it runs WITHOUT the per-user RLS GUC. That
 * only works on a role that bypasses RLS (the Neon owner). Resolution:
 *   1. CRON_DATABASE_URL — owner/BYPASSRLS URL, server-only secret.
 *   2. DATABASE_URL      — fine while it is still the owner (today's prod).
 * Once DATABASE_URL moves to `concord_app` (042, docs/deployment/app-db-role.md)
 * CRON_DATABASE_URL must be set, or every cross-user query sees zero rows;
 * the cron route reports `rls_bypass: false` so this is visible.
 *
 * Never use this client in a request handler that acts for one user — use
 * `withRlsUserId` there.
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless"
import { getSql } from "@/lib/db/client"

export type SqlClient = NeonQueryFunction<false, false>

let cached: { url: string; sql: SqlClient } | null = null

type Env = Record<string, string | undefined>

function read(env: Env, key: "CRON_DATABASE_URL" | "DATABASE_URL"): string | null {
  return env[key]?.trim() || null
}

export function cronDatabaseUrl(env: Env = process.env): string | null {
  return read(env, "CRON_DATABASE_URL") ?? read(env, "DATABASE_URL")
}

export function getCronSql(env: Env = process.env): SqlClient | null {
  const dedicated = read(env, "CRON_DATABASE_URL")
  if (!dedicated) return read(env, "DATABASE_URL") ? getSql() : null
  if (!cached || cached.url !== dedicated) cached = { url: dedicated, sql: neon(dedicated) }
  return cached.sql
}

/** True when the connected role can read across users (owner/BYPASSRLS). */
export async function roleBypassesRls(sql: SqlClient): Promise<boolean> {
  const rows = (await sql`
    SELECT (rolbypassrls OR rolsuper) AS bypass
    FROM pg_roles
    WHERE rolname = current_user
  `) as Array<{ bypass: boolean }>
  return Boolean(rows[0]?.bypass)
}
