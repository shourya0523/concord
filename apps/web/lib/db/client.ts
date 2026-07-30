/**
 * Thin DB access for apps/web — uses @ibpe/database (no new migrations).
 */
import { getDb, getSql, resetDbClients } from "@ibpe/database";
import { isDatabaseConfigured } from "./env";

export { getDb, getSql, resetDbClients, isDatabaseConfigured };

export function requireSql() {
  if (!isDatabaseConfigured()) {
    throw new DatabaseUnavailableError(
      "DATABASE_URL is not set — product APIs fall back to local bank where possible",
    );
  }
  return getSql();
}

export class DatabaseUnavailableError extends Error {
  readonly status = 503;
  constructor(message: string) {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}
