"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

import { PaperSheet, Warren, WarrenCallout } from "@/components/paper"

type Bookmark = {
  id: string
  entity_kind: "question" | "concept" | "module"
  entity_id: string
  created_at: string
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
  items: Array<{ id: string; entity_kind: string; entity_id: string }>
}

type Phase = "loading" | "ready" | "unauthenticated" | "error"

/** /saved — bookmarks, notes, collections (§10.12). */
export function SavedIsland() {
  const [phase, setPhase] = React.useState<Phase>("loading")
  const [bookmarks, setBookmarks] = React.useState<Bookmark[]>([])
  const [notes, setNotes] = React.useState<Note[]>([])
  const [collections, setCollections] = React.useState<Collection[]>([])
  const [titles, setTitles] = React.useState<Map<string, { title: string; href: string }>>(new Map())

  React.useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetch("/api/bookmarks", { signal: controller.signal }),
      fetch("/api/notes", { signal: controller.signal }),
      fetch("/api/collections", { signal: controller.signal }),
      fetch("/api/concepts", { signal: controller.signal }),
      fetch("/api/learn/modules", { signal: controller.signal }),
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
          ...new Set(
            nextBookmarks
              .filter((bookmark) => bookmark.entity_kind === "question")
              .map((bookmark) => bookmark.entity_id),
          ),
        ].slice(0, 12)
        await Promise.all(
          questionIds.map(async (id) => {
            try {
              const response = await fetch(`/api/questions/${encodeURIComponent(id)}`)
              if (!response.ok) return
              const payload = (await response.json()) as {
                question?: { canonical_wording?: string }
              }
              if (payload.question?.canonical_wording) {
                map.set(`question:${id}`, {
                  title: payload.question.canonical_wording,
                  href: `/study?question=${id}`,
                })
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
    return () => controller.abort()
  }, [])

  if (phase === "loading") {
    return (
      <PaperSheet seedKey="saved-loading" torn={false}>
        <div className="flex items-center gap-4">
          <Warren mood="thinking" size={48} />
          <p className="text-sm text-muted-foreground">Opening your saved pages…</p>
        </div>
      </PaperSheet>
    )
  }

  if (phase === "unauthenticated") {
    return (
      <PaperSheet seedKey="saved-signed-out" torn={false}>
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
      </PaperSheet>
    )
  }

  if (phase === "error") {
    return (
      <PaperSheet seedKey="saved-error" torn={false}>
        <p role="alert" className="text-sm">
          Saved items could not be read. Reload to try again.
        </p>
      </PaperSheet>
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

      <section className="space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Bookmarks · {bookmarks.length}
        </h2>
        {bookmarks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookmarks yet.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {bookmarks.map((bookmark) => {
              const resolved = titles.get(`${bookmark.entity_kind}:${bookmark.entity_id}`)
              return (
                <li key={bookmark.id} className="flex flex-wrap items-baseline gap-3 py-2.5 text-sm">
                  <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    {bookmark.entity_kind}
                  </span>
                  <Link
                    className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                    href={resolved?.href ?? "/study"}
                  >
                    {resolved?.title ?? bookmark.entity_id}
                  </Link>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {bookmark.created_at.slice(0, 10)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Notes · your own wording · {notes.length}
        </h2>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li key={note.id}>
                <PaperSheet seedKey={`note-${note.id}`} torn={false}>
                  <p className="whitespace-pre-line text-sm leading-relaxed">{note.body}</p>
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
                  </p>
                </PaperSheet>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Collections · {collections.length}
        </h2>
        {collections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No collections yet.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {collections.map((collection) => (
              <li key={collection.id}>
                <PaperSheet seedKey={`collection-${collection.id}`} torn={false}>
                  <p className="font-medium">{collection.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {collection.items.length} item{collection.items.length === 1 ? "" : "s"}
                  </p>
                </PaperSheet>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
