"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { Input } from "@ibpe/ui/components/input"

import { PaperSheet, ProvenanceChip, Warren, WarrenCallout } from "@/components/paper"
import { fetchFirmOptions } from "@/components/target-select-island"

type SavedEntityKind =
  | "question"
  | "canonical_question"
  | "concept"
  | "firm"
  | "module"
  | "module_checkpoint"
  | "resource"
  | "diagram"
  | (string & {})

type Bookmark = {
  id: string
  entity_kind: SavedEntityKind
  entity_id: string
  firm_ids?: string[]
  provenance?: string | null
  tags?: string[]
  note?: string | null
  created_at: string
  updated_at?: string
}

type Note = {
  id: string
  question_id: string | null
  body: string
  updated_at: string
}

type Collection = {
  id: string
  title: string
  description?: string | null
  created_at?: string
  updated_at?: string
  items: Array<{ id: string; entity_kind: string; entity_id: string }>
}

type Phase = "loading" | "ready" | "unauthenticated" | "error"

function formatEntityKind(kind: string): string {
  return kind.replace(/^canonical_/, "").replace(/_/g, " ")
}

function searchable(value: string | null | undefined): string {
  return (value ?? "").toLocaleLowerCase()
}

/** /saved — bookmarks, notes, collections (§10.12). */
export function SavedIsland() {
  const [phase, setPhase] = React.useState<Phase>("loading")
  const [bookmarks, setBookmarks] = React.useState<Bookmark[]>([])
  const [notes, setNotes] = React.useState<Note[]>([])
  const [collections, setCollections] = React.useState<Collection[]>([])
  const [titles, setTitles] = React.useState<Map<string, { title: string; href: string }>>(new Map())
  const [firmNames, setFirmNames] = React.useState<Map<string, string>>(new Map())
  const [query, setQuery] = React.useState("")
  const [collectionTitle, setCollectionTitle] = React.useState("")
  const [collectionStatus, setCollectionStatus] = React.useState<string | null>(null)
  const [creatingCollection, setCreatingCollection] = React.useState(false)
  const [editingNoteId, setEditingNoteId] = React.useState<string | null>(null)
  const [editingBody, setEditingBody] = React.useState("")
  const [actionStatus, setActionStatus] = React.useState<string | null>(null)

  const load = React.useCallback((signal: AbortSignal) => {
    setPhase("loading")
    Promise.all([
      fetch("/api/bookmarks", { signal }),
      fetch("/api/notes", { signal }),
      fetch("/api/collections", { signal }),
      fetch("/api/concepts", { signal }),
      fetch("/api/learn/modules", { signal }),
    ])
      .then(async ([bookmarkRes, noteRes, collectionRes, conceptRes, moduleRes]) => {
        if (bookmarkRes.status === 401 || noteRes.status === 401) {
          setPhase("unauthenticated")
          return
        }
        if (!bookmarkRes.ok || !noteRes.ok) {
          setPhase("error")
          return
        }
        const bookmarkPayload = (await bookmarkRes.json()) as { items?: Bookmark[] }
        const notePayload = (await noteRes.json()) as { items?: Note[] }
        const collectionPayload = collectionRes.ok
          ? ((await collectionRes.json()) as { items?: Collection[] })
          : { items: [] }
        const conceptPayload = conceptRes.ok
          ? ((await conceptRes.json()) as {
              items?: Array<{ concept: { id: string; slug: string; title: string } }>
            })
          : { items: [] }
        const modulePayload = moduleRes.ok
          ? ((await moduleRes.json()) as {
              items?: Array<{ id: string; slug: string; title: string }>
            })
          : { items: [] }

        const nextBookmarks = bookmarkPayload.items ?? []
        setBookmarks(nextBookmarks)
        setNotes(notePayload.items ?? [])
        setCollections(collectionPayload.items ?? [])

        const map = new Map<string, { title: string; href: string }>()
        for (const item of conceptPayload.items ?? []) {
          map.set(`concept:${item.concept.id}`, {
            title: item.concept.title,
            href: `/concepts/${item.concept.slug}`,
          })
        }
        for (const item of modulePayload.items ?? []) {
          map.set(`module:${item.id}`, { title: item.title, href: `/learn/${item.slug}` })
        }
        // Question titles resolved per id (few bookmarks; cached by the browser).
        const questionIds = [
          ...new Set([
            ...nextBookmarks
              .filter(
                (bookmark) =>
                  bookmark.entity_kind === "question" ||
                  bookmark.entity_kind === "canonical_question",
              )
              .map((bookmark) => bookmark.entity_id),
            ...(collectionPayload.items ?? []).flatMap((collection) =>
              collection.items
                .filter((item) => item.entity_kind === "question")
                .map((item) => item.entity_id),
            ),
          ]),
        ].slice(0, 24)
        await Promise.all(
          questionIds.map(async (id) => {
            try {
              const response = await fetch(`/api/questions/${encodeURIComponent(id)}`, { signal })
              if (!response.ok) return
              const payload = (await response.json()) as {
                question?: { canonical_wording?: string }
              }
              if (payload.question?.canonical_wording) {
                const resolved = {
                  title: payload.question.canonical_wording,
                  href: `/study?question=${id}`,
                }
                map.set(`question:${id}`, resolved)
                map.set(`canonical_question:${id}`, resolved)
              }
            } catch {
              // title unresolved — id fallback below
            }
          }),
        )
        setTitles(map)
        setPhase("ready")
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setPhase("error")
        }
      })
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    void fetchFirmOptions().then((options) => {
      setFirmNames(new Map(options.map((firm) => [firm.id, firm.name])))
    })
    return () => controller.abort()
  }, [load])

  const searchTerm = query.trim().toLocaleLowerCase()

  function resolvedBookmark(bookmark: Bookmark) {
    return titles.get(`${bookmark.entity_kind}:${bookmark.entity_id}`)
  }

  function fallbackHref(bookmark: Bookmark): string {
    if (bookmark.entity_kind === "firm") return `/companies/${bookmark.entity_id.replace(/^firm_/, "")}`
    if (bookmark.entity_kind === "concept") return "/concepts"
    if (bookmark.entity_kind === "module") return "/learn"
    return "/study"
  }

  function matchesSearch(parts: Array<string | null | undefined>): boolean {
    if (!searchTerm) return true
    return parts.some((part) => searchable(part).includes(searchTerm))
  }

  const filteredBookmarks = bookmarks.filter((bookmark) => {
    const resolved = resolvedBookmark(bookmark)
    return matchesSearch([
      resolved?.title,
      bookmark.entity_id,
      formatEntityKind(bookmark.entity_kind),
      bookmark.provenance,
      bookmark.note,
      bookmark.created_at,
      ...(bookmark.tags ?? []),
      ...(bookmark.firm_ids ?? []).map((firmId) => firmNames.get(firmId) ?? firmId),
    ])
  })
  const filteredNotes = notes.filter((note) =>
    matchesSearch([note.body, note.question_id, note.updated_at]),
  )
  const filteredCollections = collections.filter((collection) =>
    matchesSearch([
      collection.title,
      collection.description,
      collection.created_at,
      `${collection.items.length} items`,
      ...collection.items.flatMap((item) => [item.entity_kind, item.entity_id]),
    ]),
  )
  const filteredEmpty =
    searchTerm.length > 0 &&
    filteredBookmarks.length === 0 &&
    filteredNotes.length === 0 &&
    filteredCollections.length === 0

  /** Run a write and replace local state from the list the API returns. */
  async function mutate<T>(
    url: string,
    init: RequestInit,
    apply: (items: T[]) => void,
    success: string,
  ) {
    setActionStatus(null)
    try {
      const response = await fetch(url, {
        ...init,
        headers: init.body ? { "content-type": "application/json" } : undefined,
      })
      if (!response.ok) {
        setActionStatus(`That change could not be saved (${response.status}).`)
        return false
      }
      const payload = (await response.json()) as { items?: T[] }
      apply(payload.items ?? [])
      setActionStatus(success)
      return true
    } catch {
      setActionStatus("That change could not be saved. Try again in a moment.")
      return false
    }
  }

  function removeBookmark(bookmark: Bookmark) {
    void mutate<Bookmark>(
      `/api/bookmarks/${encodeURIComponent(bookmark.id)}`,
      { method: "DELETE" },
      setBookmarks,
      "Bookmark removed.",
    )
  }

  async function saveNoteEdit(note: Note) {
    const body = editingBody.trim()
    if (!body) return
    const ok = await mutate<Note>(
      `/api/notes/${encodeURIComponent(note.id)}`,
      { method: "PATCH", body: JSON.stringify({ body }) },
      setNotes,
      "Note updated.",
    )
    if (ok) setEditingNoteId(null)
  }

  function removeNote(note: Note) {
    if (!window.confirm("Delete this note?")) return
    void mutate<Note>(
      `/api/notes/${encodeURIComponent(note.id)}`,
      { method: "DELETE" },
      setNotes,
      "Note deleted.",
    )
  }

  function removeCollection(collection: Collection) {
    if (!window.confirm(`Delete the collection "${collection.title}"?`)) return
    void mutate<Collection>(
      `/api/collections/${encodeURIComponent(collection.id)}`,
      { method: "DELETE" },
      setCollections,
      "Collection deleted.",
    )
  }

  function removeCollectionItem(collection: Collection, itemId: string) {
    void mutate<Collection>(
      `/api/collections/${encodeURIComponent(collection.id)}/items/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
      setCollections,
      "Removed from collection.",
    )
  }

  async function createCollection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = collectionTitle.trim()
    if (!title || creatingCollection) return
    setCreatingCollection(true)
    setCollectionStatus(null)
    try {
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, items: [] }),
      })
      if (response.status === 401) {
        setPhase("unauthenticated")
        return
      }
      if (!response.ok) {
        setCollectionStatus("Collection could not be created. Try again in a moment.")
        return
      }
      const payload = (await response.json()) as { items?: Collection[]; note?: string }
      setCollections(payload.items ?? [])
      setCollectionTitle("")
      setCollectionStatus(payload.note ?? "Collection created.")
    } catch {
      setCollectionStatus("Collection could not be created. Try again in a moment.")
    } finally {
      setCreatingCollection(false)
    }
  }

  if (phase === "loading") {
    return (
      <section className="border border-border bg-background/30 px-4 py-4">
        <div className="flex items-center gap-4">
          <Warren mood="thinking" size={48} />
          <p className="text-sm text-muted-foreground">Opening your saved pages…</p>
        </div>
      </section>
    )
  }

  if (phase === "unauthenticated") {
    return (
      <section className="border border-border bg-background/30 px-4 py-4">
        <div className="flex flex-wrap items-start gap-4">
          <Warren mood="idle" size={56} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Sign in to keep bookmarks and notes.</p>
            <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Saved questions, your own wording, and collections live on your account.
            </p>
            <div className="mt-4">
              <Link href="/sign-in">
                <Button>Sign in</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (phase === "error") {
    return (
      <section className="border border-dashed border-error px-4 py-4">
        <p role="alert" className="text-sm">
          Saved items could not be read. Reload to try again.
        </p>
      </section>
    )
  }

  const empty = bookmarks.length === 0 && notes.length === 0 && collections.length === 0

  return (
    <div className="space-y-10">
      {empty ? (
        <WarrenCallout mood="encouraging" bracket>
          Nothing saved yet. In Study, press <strong className="text-foreground">b</strong> to
          bookmark a question, or capture your own wording as a note — they land here.
        </WarrenCallout>
      ) : null}

      <section className="grid gap-4 border border-border px-4 py-4 md:grid-cols-[minmax(0,1fr)_20rem]">
        <label className="block space-y-2">
          <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Search saved items
          </span>
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter bookmarks, notes, collections, firms, provenance..."
            aria-label="Search saved items"
          />
        </label>
        <form className="space-y-2" onSubmit={createCollection}>
          <label className="block space-y-2">
            <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              New collection
            </span>
            <Input
              value={collectionTitle}
              onChange={(event) => setCollectionTitle(event.target.value)}
              placeholder="e.g. GS technical prep"
              aria-label="Collection title"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={!collectionTitle.trim() || creatingCollection}>
              {creatingCollection ? "Creating..." : "Create"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Uses `/api/collections` POST; sign-in required.
            </span>
          </div>
          {collectionStatus ? (
            <p className="text-xs text-muted-foreground" role="status">
              {collectionStatus}
            </p>
          ) : null}
        </form>
      </section>

      {actionStatus ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {actionStatus}
        </p>
      ) : null}

      {filteredEmpty ? (
        <p className="border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          No saved items match "{query.trim()}". Clear the filter to see everything.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Bookmarks · {filteredBookmarks.length}
          {searchTerm ? ` / ${bookmarks.length}` : ""}
        </h2>
        {filteredBookmarks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookmarks yet.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {filteredBookmarks.map((bookmark) => {
              const resolved = resolvedBookmark(bookmark)
              const firmIds = bookmark.firm_ids ?? []
              const tags = bookmark.tags ?? []
              return (
                <li key={bookmark.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                      {formatEntityKind(bookmark.entity_kind)}
                    </span>
                    <Link
                      className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                      href={resolved?.href ?? fallbackHref(bookmark)}
                    >
                      {resolved?.title ?? bookmark.entity_id}
                    </Link>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {bookmark.created_at.slice(0, 10)}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      onClick={() => removeBookmark(bookmark)}
                    >
                      Remove
                    </button>
                  </div>
                  {bookmark.provenance || firmIds.length > 0 || tags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {bookmark.provenance ? (
                        <ProvenanceChip provenance={bookmark.provenance} />
                      ) : null}
                      {firmIds.map((firmId) => (
                        <span
                          key={firmId}
                          className="inline-flex rounded-full border border-border px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase"
                        >
                          {firmNames.get(firmId) ?? firmId.replace(/^firm_/, "").replace(/-/g, " ")}
                        </span>
                      ))}
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex rounded-full border border-border px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {bookmark.note ? (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {bookmark.note}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Notes · your own wording · {filteredNotes.length}
          {searchTerm ? ` / ${notes.length}` : ""}
        </h2>
        {filteredNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {filteredNotes.map((note) => (
              <li key={note.id}>
                <PaperSheet seedKey={`note-${note.id}`}>
                  {editingNoteId === note.id ? (
                    <div className="space-y-2">
                      <textarea
                        aria-label="Edit note"
                        value={editingBody}
                        onChange={(event) => setEditingBody(event.target.value)}
                        className="min-h-20 w-full border border-border bg-transparent p-2.5 text-sm leading-relaxed outline-none focus:border-foreground"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!editingBody.trim()}
                          onClick={() => void saveNoteEdit(note)}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingNoteId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-line text-sm leading-relaxed">{note.body}</p>
                  )}
                  <p className="mt-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                    {note.updated_at.slice(0, 10)}
                    {note.question_id ? (
                      <>
                        {" · "}
                        <Link
                          className="underline underline-offset-4"
                          href={`/study?question=${note.question_id}`}
                        >
                          open question
                        </Link>
                      </>
                    ) : null}
                    {editingNoteId !== note.id ? (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className="uppercase underline-offset-4 hover:underline"
                          onClick={() => {
                            setEditingNoteId(note.id)
                            setEditingBody(note.body)
                          }}
                        >
                          edit
                        </button>
                        {" · "}
                        <button
                          type="button"
                          className="uppercase underline-offset-4 hover:underline"
                          onClick={() => removeNote(note)}
                        >
                          delete
                        </button>
                      </>
                    ) : null}
                  </p>
                </PaperSheet>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Collections · {filteredCollections.length}
          {searchTerm ? ` / ${collections.length}` : ""}
        </h2>
        {filteredCollections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No collections yet. Create one above, then add questions to it from the study page.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {filteredCollections.map((collection) => (
              <li key={collection.id}>
                <PaperSheet seedKey={`collection-${collection.id}`}>
                  <p className="font-medium">{collection.title}</p>
                  {collection.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{collection.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {collection.items.length} item{collection.items.length === 1 ? "" : "s"}
                  </p>
                  {collection.items.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {collection.items.map((item) => {
                        const resolved = titles.get(`${item.entity_kind}:${item.entity_id}`)
                        return (
                          <li key={item.id} className="flex items-baseline gap-2">
                            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                              {formatEntityKind(item.entity_kind)}
                            </span>
                            <Link
                              className="min-w-0 flex-1 truncate underline-offset-4 hover:underline"
                              href={
                                resolved?.href ??
                                (item.entity_kind === "question"
                                  ? `/study?question=${encodeURIComponent(item.entity_id)}`
                                  : "/saved")
                              }
                            >
                              {resolved?.title ?? item.entity_id}
                            </Link>
                            <button
                              type="button"
                              aria-label="Remove from collection"
                              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => removeCollectionItem(collection, item.id)}
                            >
                              ×
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {collection.items.some((item) => item.entity_kind === "question") ? (
                      <Link
                        href={`/study?questions=${collection.items
                          .filter((item) => item.entity_kind === "question")
                          .map((item) => encodeURIComponent(item.entity_id))
                          .join(",")}`}
                      >
                        <Button size="sm" variant="outline">
                          Study this collection
                        </Button>
                      </Link>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => removeCollection(collection)}>
                      Delete
                    </Button>
                  </div>
                </PaperSheet>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
