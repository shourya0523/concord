/**
 * Notes on questions/concepts (§10.12) — paper-textured capture, RLS-scoped.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import { ensureAppUserQuery } from "./users";
import { memoryStore } from "./memory-store";

export const CreateNoteRequestSchema = z.object({
  question_id: z.string().min(1).nullable().optional(),
  body: z.string().trim().min(1).max(4000),
});
export type CreateNoteRequest = z.infer<typeof CreateNoteRequestSchema>;

export const UpdateNoteRequestSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
export type UpdateNoteRequest = z.infer<typeof UpdateNoteRequestSchema>;

export type NoteItem = {
  id: string;
  user_id: string;
  question_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export type NotesResult = {
  items: NoteItem[];
  source: "published" | "stub";
  note?: string;
};

export class NoteNotFoundError extends Error {
  readonly status = 404;
  constructor(noteId: string) {
    super(`Note not found: ${noteId}`);
    this.name = "NoteNotFoundError";
  }
}

const stubNotes = memoryStore<string, NoteItem[]>("notes");

type NoteRow = {
  id: string;
  user_id: string;
  question_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

function rowToNote(row: NoteRow): NoteItem {
  return {
    id: row.id,
    user_id: row.user_id,
    question_id: row.question_id,
    body: row.body,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

function stubResult(userId: string, note?: string): NotesResult {
  return { items: stubNotes.get(userId) ?? [], source: "stub", ...(note ? { note } : {}) };
}

/** Newest-edited first. */
export async function listNotes(userId: string): Promise<NotesResult> {
  if (!isDatabaseConfigured()) return stubResult(userId);
  try {
    const sql = requireSql();
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT n.id, n.user_id, n.question_id, n.body, n.created_at, n.updated_at
        FROM app.notes n
        JOIN app.users u ON u.id = n.user_id
        WHERE u.neon_auth_user_id = ${userId}
        ORDER BY n.updated_at DESC
        LIMIT 100
      `,
    ]);
    return {
      items: ((results[0] ?? []) as NoteRow[]).map(rowToNote),
      source: "published",
    };
  } catch (err) {
    console.warn("[notes] DB read failed; using in-memory notes", err);
    return stubResult(userId, "DB read failed — showing in-memory notes.");
  }
}

export async function createNote(options: {
  userId: string;
  email?: string | null;
  input: CreateNoteRequest;
}): Promise<NotesResult> {
  const { userId, email, input } = options;
  const now = new Date().toISOString();
  const note: NoteItem = {
    id: `note_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    user_id: userId,
    question_id: input.question_id ?? null,
    body: input.body,
    created_at: now,
    updated_at: now,
  };
  const saveInMemory = (message: string) => {
    stubNotes.set(userId, [note, ...(stubNotes.get(userId) ?? [])]);
    return stubResult(userId, message);
  };

  if (!isDatabaseConfigured()) {
    return saveInMemory("DATABASE_URL unset — note saved in memory.");
  }

  try {
    const sql = requireSql();
    await withRlsUserId(sql, userId, (s) => [
      ensureAppUserQuery(s, userId, email),
      s`
        INSERT INTO app.notes (id, user_id, question_id, body)
        VALUES (
          ${note.id},
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
          ${note.question_id},
          ${note.body}
        )
      `,
    ]);
    return listNotes(userId);
  } catch (err) {
    console.warn("[notes] DB write failed; saving in memory", err);
    return saveInMemory("DB write failed — note saved in memory.");
  }
}

export async function updateNote(options: {
  userId: string;
  noteId: string;
  input: UpdateNoteRequest;
}): Promise<NotesResult> {
  const { userId, noteId, input } = options;
  if (!isDatabaseConfigured()) {
    const items = stubNotes.get(userId) ?? [];
    const existing = items.find((item) => item.id === noteId);
    if (!existing) throw new NoteNotFoundError(noteId);
    const updated = { ...existing, body: input.body, updated_at: new Date().toISOString() };
    stubNotes.set(userId, [updated, ...items.filter((item) => item.id !== noteId)]);
    return stubResult(userId);
  }
  const sql = requireSql();
  const results = await withRlsUserId(sql, userId, (s) => [
    s`
      UPDATE app.notes
      SET body = ${input.body}, updated_at = now()
      WHERE id = ${noteId}
        AND user_id IN (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId})
      RETURNING id
    `,
  ]);
  if (((results[0] ?? []) as unknown[]).length === 0) throw new NoteNotFoundError(noteId);
  return listNotes(userId);
}

export async function deleteNote(userId: string, noteId: string): Promise<NotesResult> {
  if (!isDatabaseConfigured()) {
    const items = stubNotes.get(userId) ?? [];
    if (!items.some((item) => item.id === noteId)) throw new NoteNotFoundError(noteId);
    stubNotes.set(userId, items.filter((item) => item.id !== noteId));
    return stubResult(userId);
  }
  const sql = requireSql();
  const results = await withRlsUserId(sql, userId, (s) => [
    s`
      DELETE FROM app.notes
      WHERE id = ${noteId}
        AND user_id IN (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId})
      RETURNING id
    `,
  ]);
  if (((results[0] ?? []) as unknown[]).length === 0) throw new NoteNotFoundError(noteId);
  return listNotes(userId);
}
