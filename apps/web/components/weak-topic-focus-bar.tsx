"use client"

import * as React from "react"

import { SemanticPill } from "@/components/paper/semantic-pill"
import { topicLabel } from "@/lib/topics"
import { weakTopicsFromMastery, type WeakTopic } from "@/lib/weak-topics"

type Props = {
  focusedId?: string | null
  onFocusChange?: (topicId: string) => void
  className?: string
  onWeakTopicsLoaded?: (topics: WeakTopic[]) => void
}

/**
 * Practice focus chips from real mastery records (/api/mastery).
 * New users have no weak topics — show the honest empty state instead of
 * a fabricated list.
 */
export function WeakTopicFocusBar({ focusedId, onFocusChange, className, onWeakTopicsLoaded }: Props) {
  const [weakTopics, setWeakTopics] = React.useState<WeakTopic[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [focus, setFocus] = React.useState<string | null>(focusedId ?? null)

  React.useEffect(() => {
    const controller = new AbortController()
    fetch("/api/mastery", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return { items: [] }
        return (await response.json()) as {
          items?: Array<{ score: number; subject_id: string; subject_type: string }>
        }
      })
      .then((payload) => {
        const topics = weakTopicsFromMastery(
          (payload.items ?? []).map((item) => ({
            subject_type: item.subject_type as "concept",
            subject_id: item.subject_id,
            score: item.score,
          })),
        )
        setWeakTopics(topics)
        onWeakTopicsLoaded?.(topics)
        setLoaded(true)
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLoaded(true)
        }
      })
    return () => controller.abort()
  }, [])

  React.useEffect(() => {
    if (focusedId !== undefined) setFocus(focusedId)
  }, [focusedId])

  function select(id: string) {
    setFocus(id)
    onFocusChange?.(id)
  }

  if (loaded && weakTopics.length === 0) {
    return (
      <div className={className}>
        <p className="mb-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Practice focus
        </p>
        <p className="text-sm text-muted-foreground">
          No weak topics yet — practise a few questions and they will show up
          here.
        </p>
      </div>
    )
  }

  if (weakTopics.length === 0) return null

  return (
    <div className={className} role="group" aria-label="Practice focus topics">
      <p className="mb-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        Practice focus · from your practice history
      </p>
      <div className="flex flex-wrap gap-2">
        {weakTopics.map((topic) => {
          const active = focus === topic.topic
          return (
            <button
              key={topic.topic}
              type="button"
              onClick={() => select(topic.topic)}
              title={topic.reason}
              aria-pressed={active}
              className={active ? "rounded-full ring-1 ring-foreground" : undefined}
            >
              <SemanticPill tone="weak" icon={false}>
                <span
                  aria-hidden
                  className="inline-block size-2 bg-[repeating-linear-gradient(-45deg,var(--error-foreground),var(--error-foreground)_1px,transparent_1px,transparent_3px)]"
                />
                {topicLabel(topic.topic)} · {Math.round(topic.score * 100)}%
              </SemanticPill>
            </button>
          )
        })}
      </div>
    </div>
  )
}
