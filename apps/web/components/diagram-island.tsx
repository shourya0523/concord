"use client"

import * as React from "react"

import { parseInteractiveDiagram } from "@ibpe/contracts"
import {
  DiagramCanvas,
  isInteractiveDiagramSource,
} from "@ibpe/ui/components/diagram-canvas"
import {
  DiagramFillBlank,
  type FillBlankResult,
} from "@ibpe/ui/components/diagram-fill-blank"

type Props = {
  title: string
  source: string
  a11yFallback: string
  /** Body format; auto-detected from the source when omitted. */
  format?: "mermaid" | "interactive-json"
  className?: string
  /** Interactive quizzes only: called after each "Check answers". */
  onCheck?: (result: FillBlankResult) => void
}

function TextFallback({ title, a11yFallback }: { title: string; a11yFallback: string }) {
  return (
    <div className="border-border bg-card rounded-[16px] border p-4">
      <p className="mb-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        {title} · text fallback
      </p>
      <p className="text-sm leading-relaxed text-foreground">{a11yFallback}</p>
    </div>
  )
}

/**
 * Client island for teaching diagrams. Dispatches by format (P7.2):
 * `interactive-json` → DiagramFillBlank (never Mermaid); `mermaid` →
 * DiagramCanvas with reduced-motion / parse-failure text fallbacks.
 */
export function DiagramIsland({
  title,
  source,
  a11yFallback,
  format,
  className,
  onCheck,
}: Props) {
  const interactive = isInteractiveDiagramSource(source, format)
  const parsed = React.useMemo(
    () => (interactive ? parseInteractiveDiagram(source) : null),
    [interactive, source],
  )

  if (interactive) {
    if (!parsed) {
      // Invalid interactive body: show the accessible description, never Mermaid.
      return <TextFallback title={title} a11yFallback={a11yFallback} />
    }
    return (
      <DiagramFillBlank
        diagram={parsed}
        title={title}
        a11yDescription={a11yFallback}
        className={className}
        onCheck={onCheck}
      />
    )
  }

  return (
    <DiagramCanvas
      title={title}
      source={source}
      format="mermaid"
      className={className}
      reducedMotionFallback={<TextFallback title={title} a11yFallback={a11yFallback} />}
      fallback={
        <div className="space-y-3">
          <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {source}
          </pre>
          <details className="text-sm">
            <summary className="cursor-pointer font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              Accessible description
            </summary>
            <p className="mt-2 text-foreground/90">{a11yFallback}</p>
          </details>
        </div>
      }
    />
  )
}
