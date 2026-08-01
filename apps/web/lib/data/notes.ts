/**
 * Notes on questions/concepts (§10.12) — paper-textured capture, RLS-scoped.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import { ensureAppUserQuery } from "./users";

export const CreateNoteRequestSchema = z.object({
  question_id: z.string().min(1).nullable().optional(),
  body: z.string().trim().min(1).max(4000),
});
export type CreateNoteRequest = z.infer<typeof CreateNoteRequestSchema>;

export type NoteItem = {
  id: string;
  user_id: string;
  question_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

const stubNotes = new Map<string, NoteItem[]>();

export async function createNote(options: {
  userId: string;
  email?: string | null;
  input: CreateNoteRequest;
}): Promise<{ items: NoteItem[]; source: "published" | "stub"; note?: string }> {
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

  if (!isDatabaseConfigured()) {
    const items = [note, ...(stubNotes.get(userId) ?? [])];
    stubNotes.set(userId, items);
    return { items, source: "stub", note: "DATABASE_URL unset — note saved in memory." };
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
    const rows = (results[0] ?? []) as Array<{
      id: string;
      user_id: string;
      question_id: string | null;
      body: string;
      created_at: string;
      updated_at: string;
    }>;
    return {
      items: rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        question_id: row.question_id,
        body: row.body,
        created_at: new Date(row.created_at).toISOString(),
        updated_at: new Date(row.updated_at).toISOString(),
      })),
      source: "published",
    };
  } catch (err) {
    console.warn("[notes] DB write failed; saving in memory", err);
    const items = [note, ...(stubNotes.get(userId) ?? [])];
    stubNotes.set(userId, items);
    return { items, source: "stub", note: "DB write failed — note saved in memory." };
  }
}
