"use client"

import * as React from "react"

import { WeakTopicChip } from "@ibpe/ui/components/weak-topic-chip"

import { WEAK_TOPICS } from "@/lib/mock-data"

type Props = {
  focusedId?: string | null
  onFocusChange?: (topicId: string) => void
  className?: string
}

/**
 * Weak-topic chips with auto-focus: highest severity starts focused.
 */
export function WeakTopicFocusBar({ focusedId, onFocusChange, className }: Props) {
  const defaultFocus = WEAK_TOPICS.find((t) => t.severity === "high")?.id ?? WEAK_TOPICS[0]?.id
  const [focus, setFocus] = React.useState<string | null>(focusedId ?? defaultFocus ?? null)

  React.useEffect(() => {
    if (focusedId !== undefined) setFocus(focusedId)
  }, [focusedId])

  function select(id: string) {
    setFocus(id)
    onFocusChange?.(id)
  }

  return (
    <div className={className} role="group" aria-label="Weak topics — auto-focus">
      <p className="mb-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        Weak topics · auto-focus
      </p>
      <div className="flex flex-wrap gap-2">
        {WEAK_TOPICS.map((topic) => (
          <WeakTopicChip
            key={topic.id}
            label={topic.label}
            severity={topic.severity}
            focused={focus === topic.id}
            onClick={() => select(topic.id)}
          />
        ))}
      </div>
    </div>
  )
}
