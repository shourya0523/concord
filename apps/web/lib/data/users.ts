import type { NeonQueryFunction } from "@neondatabase/serverless";

type SqlClient = NeonQueryFunction<false, false>;
type SqlQuery = ReturnType<SqlClient>;

/**
 * Keep RLS app.users bootstrap colocated with user-scoped writes.
 *
 * Race-safe: `ON CONFLICT DO NOTHING` (no target) arbitrates on both unique
 * indexes (`id`, `neon_auth_user_id`), so concurrent first requests never hit
 * a unique violation. `ON CONFLICT (neon_auth_user_id) DO UPDATE` could, via
 * the non-arbiter `id` primary key. The email refresh runs as a separate
 * UPDATE in the same statement (one result set, so batch indexes are stable).
 */
export function ensureAppUserQuery(
  sql: SqlClient,
  userId: string,
  email?: string | null,
): SqlQuery {
  const nextEmail = email ?? null;
  return sql`
    WITH inserted AS (
      INSERT INTO app.users (id, neon_auth_user_id, email)
      VALUES (${userId}, ${userId}, ${nextEmail})
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    UPDATE app.users SET email = ${nextEmail}::text
    WHERE neon_auth_user_id = ${userId}
      AND ${nextEmail}::text IS NOT NULL
      AND email IS DISTINCT FROM ${nextEmail}::text
      AND NOT EXISTS (SELECT 1 FROM inserted)
  `;
}
