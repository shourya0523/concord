import { handleRouteError, jsonError, respondTyped } from "@/lib/api/http";
import { NotesListResponseSchema } from "@/lib/api/schemas";
import { getSession, isNeonAuthConfigured } from "@/lib/auth/server";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/notes — user notes under RLS when DB + auth available. */
export async function GET() {
  try {
    const session = await getSession();
    const userId = session.data?.user?.id;
    if (!userId) {
      if (isNeonAuthConfigured()) {
        return jsonError(401, "unauthorized", "Sign in to view notes");
      }
      return respondTyped(NotesListResponseSchema, {
        items: [],
        source: "stub",
      });
    }

    if (!isDatabaseConfigured()) {
      return respondTyped(NotesListResponseSchema, {
        items: [],
        source: "stub",
      });
    }

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

    type NoteRow = {
      id: string;
      user_id: string;
      question_id: string | null;
      body: string;
      created_at: string;
      updated_at: string;
    };
    const rows = (results[0] ?? []) as NoteRow[];

    return respondTyped(NotesListResponseSchema, {
      items: rows.map((n) => ({
        id: n.id,
        user_id: n.user_id,
        question_id: n.question_id,
        body: n.body,
        created_at: new Date(n.created_at).toISOString(),
        updated_at: new Date(n.updated_at).toISOString(),
      })),
      source: "published",
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
