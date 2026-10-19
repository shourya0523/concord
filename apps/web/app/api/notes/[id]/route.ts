import { handleRouteError, parseOrError, respondTyped } from "@/lib/api/http";
import { NotesListResponseSchema } from "@/lib/api/schemas";
import { getApiUser } from "@/lib/api/auth";
import { UpdateNoteRequestSchema, deleteNote, updateNote } from "@/lib/data/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/notes/[id] — rewrite a note's body. */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const user = await getApiUser("edit notes");
    if (!user.ok) return user.response;
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(UpdateNoteRequestSchema, body);
    if (!parsed.ok) return parsed.response;
    return respondTyped(
      NotesListResponseSchema,
      await updateNote({ userId: user.userId, noteId: id, input: parsed.data }),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

/** DELETE /api/notes/[id] */
export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const user = await getApiUser("delete notes");
    if (!user.ok) return user.response;
    const { id } = await ctx.params;
    return respondTyped(NotesListResponseSchema, await deleteNote(user.userId, id));
  } catch (err) {
    return handleRouteError(err);
  }
}
