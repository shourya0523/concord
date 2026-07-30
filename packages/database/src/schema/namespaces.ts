import { pgSchema } from "drizzle-orm/pg-core";

export const rawSchema = pgSchema("raw");
export const stagingSchema = pgSchema("staging");
export const canonicalSchema = pgSchema("canonical");
export const publishedSchema = pgSchema("published");
export const appSchema = pgSchema("app");
export const adminSchema = pgSchema("admin");
