"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

import { Tombstone, Warren } from "@/components/paper"
import { tombstoneFace } from "@/lib/achievements"
import type { AchievementsResponse } from "@/lib/api/retention-schemas"

type Phase = "loading" | "ready" | "unauthenticated" | "error"

/** Tombstone shelf (DESIGN.md §16): earned first, then pencil outlines. */
export function AchievementShelfIsland() {
  const [phase, setPhase] = React.useState<Phase>("loading")
  const [shelf, setShelf] = React.useState<AchievementsResponse | null>(null)

  const load = React.useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/achievements", { signal, cache: "no-store" })
      if (res.status === 401) return setPhase("unauthenticated")
      if (!res.ok) return setPhase("error")
      setShelf((await res.json()) as AchievementsResponse)
      setPhase("ready")
    } catch (err) {
      if ((err as Error).name !== "AbortError") setPhase("error")
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (phase === "loading") {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Warren mood="thinking" size={44} /> Dusting the shelf…
      </div>
    )
  }
  if (phase === "unauthenticated") {
    return (
      <p className="text-sm">
        <Link href="/sign-in?next=/achievements" className="underline underline-offset-4">
          Sign in
        </Link>{" "}
        to see your shelf.
      </p>
    )
  }
  if (phase === "error" || !shelf) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>The shelf didn&apos;t load.</span>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    )
  }

  const fresh = new Set((shelf.newly_earned ?? []).map((a) => a.id))
  return (
    <div className="space-y-10">
      <section className="space-y-4" aria-labelledby="shelf-earned">
        <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
          <h2 id="shelf-earned" className="font-display text-2xl tracking-tight">
            Closed
          </h2>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{shelf.earned.length} on the shelf</span>
        </div>
        {shelf.earned.length > 0 ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-5">
            {shelf.earned.map((achievement) => {
              const face = tombstoneFace(achievement)
              return (
                <li key={achievement.id}>
                  <Tombstone
                    id={achievement.id}
                    face={face.face}
                    what={face.what}
                    description={achievement.description}
                    earnedAt={achievement.earned_at}
                    place={fresh.has(achievement.id)}
                  />
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing closed yet. Meet a daily goal three days running for the first tombstone.
          </p>
        )}
      </section>

      {shelf.locked.length > 0 ? (
        <section className="space-y-4" aria-labelledby="shelf-locked">
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
            <h2 id="shelf-locked" className="font-display text-2xl tracking-tight">
              In the pipeline
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{shelf.locked.length} to close</span>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-5">
            {shelf.locked.map((achievement) => {
              const face = tombstoneFace(achievement)
              return (
                <li key={achievement.id}>
                  <Tombstone
                    id={achievement.id}
                    face={face.face}
                    what={face.what}
                    description={achievement.description}
                    locked
                    progress={achievement.progress ?? null}
                    progressLabel={achievement.progress_label ?? null}
                  />
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
