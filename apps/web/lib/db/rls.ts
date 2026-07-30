/**
 * Set Postgres RLS GUC `app.neon_auth_user_id` (ADR 0006 / migrations/030).
 *
 * Neon HTTP serverless uses one-shot requests, so GUC must be applied inside
 * the same `sql.transaction([...])` batch as the protected queries.
 */
import type { NeonQueryFunction } from "@neondatabase/serverless";

export const NEON_AUTH_USER_ID_GUC = "app.neon_auth_user_id";

type SqlClient = NeonQueryFunction<false, false>;
// neon tagged-template results are thenables accepted by sql.transaction
type SqlQuery = ReturnType<SqlClient>;

/** First statement of a user-scoped transaction batch. */
export function rlsSetConfigQuery(sql: SqlClient, neonAuthUserId: string): SqlQuery {
  return sql`SELECT set_config(${NEON_AUTH_USER_ID_GUC}, ${neonAuthUserId}, true)`;
}

/**
 * Run queries under RLS for the given Neon Auth user id.
 * Returns result sets for the queries after set_config (index-aligned).
 */
export async function withRlsUserId(
  sql: SqlClient,
  neonAuthUserId: string,
  buildQueries: (sql: SqlClient) => SqlQuery[],
): Promise<unknown[]> {
  const queries = [rlsSetConfigQuery(sql, neonAuthUserId), ...buildQueries(sql)];
  const results = (await sql.transaction(queries as never)) as unknown[];
  return results.slice(1);
}
