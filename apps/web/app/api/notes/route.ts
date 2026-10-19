import { handleRouteError, parseOrError, respondTyped } from "@/lib/api/http";
import { NotesListResponseSchema } from "@/lib/api/schemas";
import { getApiUser } from "@/lib/api/auth";
import { CreateNoteRequestSchema, createNote, listNotes } from "@/lib/data/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/notes — user notes under RLS when DB + auth available. */
export async function GET() {
  try {
    const user = await getApiUser("view notes");
    if (!user.ok) return user.response;
    return respondTyped(NotesListResponseSchema, await listNotes(user.userId));
  } catch (err) {
    return handleRouteError(err);
  }
}

/** POST /api/notes — capture a note on a question (or free-standing). */
export async function POST(request: Request) {
  try {
    const user = await getApiUser("capture notes");
    if (!user.ok) return user.response;
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(CreateNoteRequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const result = await createNote({
      userId: user.userId,
      email: user.email,
      input: parsed.data,
    });
    return respondTyped(NotesListResponseSchema, result, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
