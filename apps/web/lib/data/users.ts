import type { NeonQueryFunction } from "@neondatabase/serverless";

type SqlClient = NeonQueryFunction<false, false>;
type SqlQuery = ReturnType<SqlClient>;

/** Keep RLS app.users bootstrap colocated with user-scoped writes. */
export function ensureAppUserQuery(
  sql: SqlClient,
  userId: string,
  email?: string | null,
): SqlQuery {
  return sql`
    INSERT INTO app.users (id, neon_auth_user_id, email)
    VALUES (${userId}, ${userId}, ${email ?? null})
    ON CONFLICT (neon_auth_user_id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, app.users.email)
  `;
}
