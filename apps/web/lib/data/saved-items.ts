import { randomUUID } from "node:crypto";
import type {
  Bookmark,
  BookmarkListResponse,
  Collection,
  CollectionListResponse,
  CreateBookmarkRequest,
  CreateCollectionRequest,
} from "@/lib/api/schemas";
import {
  BookmarkSchema,
  CollectionSchema,
} from "@/lib/api/schemas";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import { ensureAppUserQuery } from "./users";

const stubBookmarks = new Map<string, Bookmark[]>();
const stubCollections = new Map<string, Collection[]>();

function nowIso(): string {
  return new Date().toISOString();
}

export async function listBookmarks(
  userId: string,
): Promise<BookmarkListResponse> {
  if (!isDatabaseConfigured()) {
    return { items: stubBookmarks.get(userId) ?? [], source: "stub" };
  }

  try {
    const sql = requireSql();
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT b.id, b.user_id, b.question_id, b.concept_id, b.created_at
        FROM app.bookmarks b
        JOIN app.users u ON u.id = b.user_id
        WHERE u.neon_auth_user_id = ${userId}
        ORDER BY b.created_at DESC
        LIMIT 250
      `,
    ]);
    const rows = (results[0] ?? []) as Array<{
      id: string;
      user_id: string;
      question_id: string | null;
      concept_id: string | null;
      created_at: string;
    }>;
    const items = rows.map((row) =>
      BookmarkSchema.parse({
        id: row.id,
        user_id: userId,
        item_type: row.question_id ? "question" : "concept",
        item_id: row.question_id ?? row.concept_id ?? "unknown",
        created_at: new Date(row.created_at).toISOString(),
      }),
    );
    return { items, source: "published" };
  } catch (err) {
    console.warn("[bookmarks] DB read failed; using stub bookmarks", err);
    return { items: stubBookmarks.get(userId) ?? [], source: "stub" };
  }
}

export async function createBookmark(options: {
  userId: string;
  email?: string | null;
  input: CreateBookmarkRequest;
}): Promise<BookmarkListResponse> {
  const item = BookmarkSchema.parse({
    id: `bm_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    user_id: options.userId,
    item_type: options.input.item_type,
    item_id: options.input.item_id,
    created_at: nowIso(),
  });

  if (!isDatabaseConfigured()) {
    const items = [item, ...(stubBookmarks.get(options.userId) ?? [])];
    stubBookmarks.set(options.userId, items);
    return {
      items,
      source: "stub",
      note: "DATABASE_URL unset — saved bookmark in memory.",
    };
  }

  if (item.item_type !== "question" && item.item_type !== "concept") {
    const items = [item, ...(stubBookmarks.get(options.userId) ?? [])];
    stubBookmarks.set(options.userId, items);
    return {
      items,
      source: "stub",
      note: "Current DB bookmark table supports question/concept only; saved in memory.",
    };
  }

  try {
    const sql = requireSql();
    await withRlsUserId(sql, options.userId, (s) => [
      ensureAppUserQuery(s, options.userId, options.email),
      s`
        INSERT INTO app.bookmarks (id, user_id, question_id, concept_id)
        VALUES (
          ${item.id},
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${options.userId} LIMIT 1),
          ${item.item_type === "question" ? item.item_id : null},
          ${item.item_type === "concept" ? item.item_id : null}
        )
      `,
    ]);
    return listBookmarks(options.userId);
  } catch (err) {
    console.warn("[bookmarks] DB write failed; saving in memory", err);
    const items = [item, ...(stubBookmarks.get(options.userId) ?? [])];
    stubBookmarks.set(options.userId, items);
    return {
      items,
      source: "stub",
      note: "DB bookmark write failed — saved bookmark in memory.",
    };
  }
}

export async function listCollections(
  userId: string,
): Promise<CollectionListResponse> {
  if (!isDatabaseConfigured()) {
    return { items: stubCollections.get(userId) ?? [], source: "stub" };
  }

  try {
    const sql = requireSql();
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT c.id, c.user_id, c.name, c.created_at
        FROM app.collections c
        JOIN app.users u ON u.id = c.user_id
        WHERE u.neon_auth_user_id = ${userId}
        ORDER BY c.created_at DESC
        LIMIT 100
      `,
    ]);
    const rows = (results[0] ?? []) as Array<{
      id: string;
      user_id: string;
      name: string;
      created_at: string;
    }>;
    const items = rows.map((row) =>
      CollectionSchema.parse({
        id: row.id,
        user_id: userId,
        name: row.name,
        items: [],
        created_at: new Date(row.created_at).toISOString(),
      }),
    );
    return {
      items,
      source: "published",
      note: "Collection items await a DB collection_items table; list returns containers.",
    };
  } catch (err) {
    console.warn("[collections] DB read failed; using stub collections", err);
    return { items: stubCollections.get(userId) ?? [], source: "stub" };
  }
}

export async function createCollection(options: {
  userId: string;
  email?: string | null;
  input: CreateCollectionRequest;
}): Promise<CollectionListResponse> {
  const item = CollectionSchema.parse({
    id: `col_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    user_id: options.userId,
    name: options.input.name,
    items: options.input.items.map((collectionItem) => ({
      ...collectionItem,
      added_at: nowIso(),
    })),
    created_at: nowIso(),
  });

  if (!isDatabaseConfigured()) {
    const items = [item, ...(stubCollections.get(options.userId) ?? [])];
    stubCollections.set(options.userId, items);
    return {
      items,
      source: "stub",
      note: "DATABASE_URL unset — saved collection in memory.",
    };
  }

  try {
    const sql = requireSql();
    await withRlsUserId(sql, options.userId, (s) => [
      ensureAppUserQuery(s, options.userId, options.email),
      s`
        INSERT INTO app.collections (id, user_id, name)
        VALUES (
          ${item.id},
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${options.userId} LIMIT 1),
          ${item.name}
        )
      `,
    ]);
    const listed = await listCollections(options.userId);
    return {
      ...listed,
      note:
        item.items.length > 0
          ? "Collection container saved; DB collection item table is not present yet."
          : listed.note,
    };
  } catch (err) {
    console.warn("[collections] DB write failed; saving in memory", err);
    const items = [item, ...(stubCollections.get(options.userId) ?? [])];
    stubCollections.set(options.userId, items);
    return {
      items,
      source: "stub",
      note: "DB collection write failed — saved collection in memory.",
    };
  }
}
