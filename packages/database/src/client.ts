import { neon, neonConfig, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema/index.js";

export type IbpeDb = NeonHttpDatabase<typeof schema>;

let _sql: NeonQueryFunction<false, false> | null = null;
let _db: IbpeDb | null = null;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Provision Neon (Vercel Marketplace or neon.tech) and export DATABASE_URL. Do not use @vercel/postgres.",
    );
  }
  return url;
}

/** Lazy Neon tagged-template client — safe at Next.js build time until first call. */
export function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    // Dev / CI only: route neon() HTTP queries to a local shim
    // (scripts/dev/neon_http_shim.py) instead of Neon's /sql endpoint.
    const localEndpoint = process.env.NEON_FETCH_ENDPOINT?.trim();
    if (localEndpoint && process.env.VERCEL_ENV !== "production") {
      neonConfig.fetchEndpoint = localEndpoint;
    }
    _sql = neon(requireDatabaseUrl());
  }
  return _sql;
}

/** Lazy Drizzle client bound to package schema. */
export function getDb(): IbpeDb {
  if (!_db) {
    _db = drizzle(getSql(), { schema });
  }
  return _db;
}

/** Test helper — reset memoised clients. */
export function resetDbClients(): void {
  _sql = null;
  _db = null;
}
