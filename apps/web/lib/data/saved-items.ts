import { randomUUID } from "node:crypto";
import {
  BookmarkSchema,
  CollectionItemSchema,
  CollectionSchema,
  type Bookmark,
  type CollectionItem,
} from "@ibpe/contracts";
import type {
  BookmarkListResponse,
  CollectionListResponse,
  CollectionWithItems,
  CreateBookmarkRequest,
  CreateCollectionRequest,
} from "@/lib/api/schemas";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import { ensureAppUserQuery } from "./users";

const stubBookmarks = new Map<string, Bookmark[]>();
const stubCollections = new Map<string, CollectionWithItems[]>();

function nowIso(): string {
  return new Date().toISOString();
}

function collectionItemColumns(entityKind: string, entityId: string) {
  return {
    questionId: entityKind === "question" ? entityId : null,
    conceptId: entityKind === "concept" ? entityId : null,
    moduleId: entityKind === "module" ? entityId : null,
  };
}

function rowToEntity(
  row: {
    question_id: string | null;
    concept_id: string | null;
    module_id?: string | null;
  },
): { entity_kind: "question" | "concept" | "module"; entity_id: string } | null {
  if (row.question_id) return { entity_kind: "question", entity_id: row.question_id };
  if (row.concept_id) return { entity_kind: "concept", entity_id: row.concept_id };
  if (row.module_id) return { entity_kind: "module", entity_id: row.module_id };
  return null;
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
    const items = rows
      .map((row) => {
        const entity = rowToEntity(row);
        if (!entity) return null;
        const created = new Date(row.created_at).toISOString();
        return BookmarkSchema.parse({
          id: row.id,
          user_id: userId,
          entity_kind: entity.entity_kind,
          entity_id: entity.entity_id,
          firm_ids: [],
          tags: [],
          note: null,
          created_at: created,
          updated_at: created,
        });
      })
      .filter((item): item is Bookmark => Boolean(item));
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
  const now = nowIso();
  const item = BookmarkSchema.parse({
    id: `bm_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    user_id: options.userId,
    entity_kind: options.input.entity_kind,
    entity_id: options.input.entity_id,
    firm_ids: options.input.firm_ids,
    tags: options.input.tags,
    note: options.input.note ?? null,
    created_at: now,
    updated_at: now,
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

  if (item.entity_kind !== "question" && item.entity_kind !== "concept") {
    const items = [item, ...(stubBookmarks.get(options.userId) ?? [])];
    stubBookmarks.set(options.userId, items);
    return {
      items,
      source: "stub",
      note: "app.bookmarks currently supports question/concept only; saved in memory.",
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
          ${item.entity_kind === "question" ? item.entity_id : null},
          ${item.entity_kind === "concept" ? item.entity_id : null}
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

async function loadCollectionItems(
  userId: string,
  collectionId: string,
): Promise<CollectionItem[]> {
  const sql = requireSql();
  const results = await withRlsUserId(sql, userId, (s) => [
    s`
      SELECT id, collection_id, question_id, concept_id, module_id, position, created_at
      FROM app.collection_items
      WHERE collection_id = ${collectionId}
      ORDER BY position ASC, created_at ASC
    `,
  ]);
  const rows = (results[0] ?? []) as Array<{
    id: string;
    collection_id: string;
    question_id: string | null;
    concept_id: string | null;
    module_id: string | null;
    position: number;
    created_at: string;
  }>;
  return rows
    .map((row) => {
      const entity = rowToEntity(row);
      if (!entity) return null;
      return CollectionItemSchema.parse({
        id: row.id,
        collection_id: row.collection_id,
        entity_kind: entity.entity_kind,
        entity_id: entity.entity_id,
        position: Number(row.position) || 0,
        note: null,
        created_at: new Date(row.created_at).toISOString(),
      });
    })
    .filter((item): item is CollectionItem => Boolean(item));
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
    const items: CollectionWithItems[] = [];
    for (const row of rows) {
      const created = new Date(row.created_at).toISOString();
      const collectionItems = await loadCollectionItems(userId, row.id);
      items.push({
        ...CollectionSchema.parse({
          id: row.id,
          user_id: userId,
          title: row.name,
          description: null,
          cover_asset_id: null,
          created_at: created,
          updated_at: created,
        }),
        items: collectionItems,
      });
    }
    return { items, source: "published" };
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
  const now = nowIso();
  const collectionId = `col_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const items = options.input.items.map((item, index) =>
    CollectionItemSchema.parse({
      id: `ci_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
      collection_id: collectionId,
      entity_kind: item.entity_kind,
      entity_id: item.entity_id,
      position: item.position ?? index,
      note: item.note ?? null,
      created_at: now,
    }),
  );
  const collection: CollectionWithItems = {
    ...CollectionSchema.parse({
      id: collectionId,
      user_id: options.userId,
      title: options.input.title,
      description: options.input.description ?? null,
      cover_asset_id: null,
      created_at: now,
      updated_at: now,
    }),
    items,
  };

  if (!isDatabaseConfigured()) {
    const listed = [collection, ...(stubCollections.get(options.userId) ?? [])];
    stubCollections.set(options.userId, listed);
    return {
      items: listed,
      source: "stub",
      note: "DATABASE_URL unset — saved collection in memory.",
    };
  }

  try {
    const sql = requireSql();
    const itemInserts = items
      .filter((item) =>
        ["question", "concept", "module"].includes(item.entity_kind),
      )
      .map((item) => {
        const cols = collectionItemColumns(item.entity_kind, item.entity_id);
        return {
          id: item.id,
          ...cols,
          position: item.position,
        };
      });

    await withRlsUserId(sql, options.userId, (s) => [
      ensureAppUserQuery(s, options.userId, options.email),
      s`
        INSERT INTO app.collections (id, user_id, name)
        VALUES (
          ${collection.id},
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${options.userId} LIMIT 1),
          ${collection.title}
        )
      `,
      ...itemInserts.map(
        (item) => s`
          INSERT INTO app.collection_items (
            id, collection_id, question_id, concept_id, module_id, position
          )
          VALUES (
            ${item.id},
            ${collection.id},
            ${item.questionId},
            ${item.conceptId},
            ${item.moduleId},
            ${item.position}
          )
        `,
      ),
    ]);
    return listCollections(options.userId);
  } catch (err) {
    console.warn("[collections] DB write failed; saving in memory", err);
    const listed = [collection, ...(stubCollections.get(options.userId) ?? [])];
    stubCollections.set(options.userId, listed);
    return {
      items: listed,
      source: "stub",
      note: "DB collection write failed — saved collection in memory.",
    };
  }
}
